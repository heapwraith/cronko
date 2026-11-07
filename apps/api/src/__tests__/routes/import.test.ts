import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Hono } from "hono"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "../fixtures", name), "utf8"))

type Report = {
  data: {
    dryRun: boolean
    created: { source: string; name?: string; warnings: string[] }[]
    skipped: { source: string; reason?: string }[]
  }
}
type M = {
  name: string
  paused: boolean
  expectedIntervalSeconds: number
  gracePeriodSeconds: number
  scheduleCron: string | null
  timezone: string | null
  tags: string[]
}

describe("importers (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { importRoute } = await import("../../routes/import")
    const { monitorsRoute } = await import("../../routes/monitors")
    app = new Hono().route("/api/import", importRoute).route("/api/monitors", monitorsRoute)
  })
  beforeEach(() => ctx.reset())
  afterEach(() => vi.unstubAllGlobals())

  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  const monitors = async () =>
    ((await (await app.request("/api/monitors")).json()) as { data: M[] }).data

  describe("healthchecks", () => {
    it("dry run reports and creates nothing", async () => {
      const res = await post(
        "/api/import/healthchecks?dryRun=true",
        fixture("healthchecks-checks.json"),
      )
      const { data } = (await res.json()) as Report
      expect(data.dryRun).toBe(true)
      expect(data.created.map((c) => c.name)).toEqual([
        "Filesystem Backup",
        "Database Backup",
        "Long Grace",
      ])
      expect(data.skipped.map((s) => s.source)).toEqual(["Broken Cron", "#4"])
      expect(await monitors()).toHaveLength(0)
    })

    it("maps timeout, cron, tags, grace and paused", async () => {
      const res = await post("/api/import/healthchecks", fixture("healthchecks-checks.json"))
      const { data } = (await res.json()) as Report
      expect(data.created).toHaveLength(3)
      expect(data.created[0]?.warnings.join(" ")).toMatch(/keyword filters/)
      expect(data.created[2]?.warnings.join(" ")).toMatch(/reduced to 86400/)

      const byName = Object.fromEntries((await monitors()).map((m) => [m.name, m]))
      expect(byName["Filesystem Backup"]).toMatchObject({
        expectedIntervalSeconds: 3600,
        gracePeriodSeconds: 600,
        tags: ["backup", "fs"],
        scheduleCron: null,
        paused: false,
      })
      expect(byName["Database Backup"]).toMatchObject({
        scheduleCron: "15 5 * * *",
        timezone: "America/Sao_Paulo",
        gracePeriodSeconds: 1200,
        tags: ["production", "db"],
        paused: true,
      })
      expect(byName["Long Grace"]?.gracePeriodSeconds).toBe(86_400)
    })

    it("skips names that already exist, also on a second run", async () => {
      await post("/api/import/healthchecks", fixture("healthchecks-checks.json"))
      const res = await post("/api/import/healthchecks", fixture("healthchecks-checks.json"))
      const { data } = (await res.json()) as Report
      expect(data.created).toHaveLength(0)
      expect(data.skipped.filter((s) => /already exists/.test(s.reason ?? ""))).toHaveLength(3)
      expect(await monitors()).toHaveLength(3)
    })

    it("fetches from the Management API with X-Api-Key", async () => {
      const fetchMock = vi.fn(async () => Response.json(fixture("healthchecks-checks.json")))
      vi.stubGlobal("fetch", fetchMock)
      const res = await post("/api/import/healthchecks?dryRun=true", {
        apiKey: "secret",
        baseUrl: "https://hc.example.com",
      })
      expect(res.status).toBe(200)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
      expect(String(url)).toBe("https://hc.example.com/api/v3/checks/")
      expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("secret")
    })

    it("passes on a rejected key and rejects bad bodies", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("no", { status: 401 })),
      )
      expect((await post("/api/import/healthchecks", { apiKey: "bad" })).status).toBe(401)
      expect((await post("/api/import/healthchecks", { nope: 1 })).status).toBe(400)
      expect(
        (await post("/api/import/healthchecks", { apiKey: "k", baseUrl: "ftp://x" })).status,
      ).toBe(400)
    })
  })

  describe("kuma", () => {
    it("imports push monitors and reports the other types as skipped", async () => {
      const res = await post("/api/import/kuma", fixture("kuma-backup.json"))
      const { data } = (await res.json()) as Report
      expect(data.created.map((c) => c.name)).toEqual(["Nightly rsync", "Paused push"])
      expect(data.skipped.map((s) => s.source)).toEqual(["Website", "DB port"])
      expect(data.skipped[0]?.reason).toMatch(/active check/)

      const byName = Object.fromEntries((await monitors()).map((m) => [m.name, m]))
      expect(byName["Nightly rsync"]).toMatchObject({
        expectedIntervalSeconds: 86_400,
        tags: ["backup"],
        paused: false,
      })
      expect(byName["Paused push"]).toMatchObject({ expectedIntervalSeconds: 300, paused: true })
    })

    it("dry run creates nothing; a body without monitorList is a 400", async () => {
      await post("/api/import/kuma?dryRun=true", fixture("kuma-backup.json"))
      expect(await monitors()).toHaveLength(0)
      expect((await post("/api/import/kuma", { foo: 1 })).status).toBe(400)
    })
  })
  describe("cronitor", () => {
    it("imports jobs and heartbeats and skips active checks", async () => {
      const res = await post("/api/import/cronitor", fixture("cronitor-monitors.json"))
      const { data } = (await res.json()) as Report
      expect(data.created.map((c) => c.name)).toEqual([
        "Daily Database Backup",
        "worker-alive",
        "nightly-report",
        "Multi schedule",
        "long-grace",
      ])
      const reasons = Object.fromEntries(data.skipped.map((s) => [s.source, s.reason]))
      expect(reasons.Homepage).toMatch(/active check/)
      expect(reasons["Marketing site"]).toMatch(/active check/)
      expect(reasons["Odd schedule"]).toMatch(/unsupported schedule/)
      expect(reasons["No schedule"]).toMatch(/no schedule/)
    })

    it("maps cron, interval, time-of-day, grace, tags and paused", async () => {
      await post("/api/import/cronitor", fixture("cronitor-monitors.json"))
      const byName = Object.fromEntries((await monitors()).map((m) => [m.name, m]))
      expect(byName["Daily Database Backup"]).toMatchObject({
        scheduleCron: "0 2 * * *",
        timezone: "America/New_York",
        gracePeriodSeconds: 300,
        tags: ["prod", "db"],
        paused: false,
      })
      expect(byName["worker-alive"]).toMatchObject({
        expectedIntervalSeconds: 300,
        scheduleCron: null,
        paused: true,
      })
      expect(byName["nightly-report"]).toMatchObject({
        scheduleCron: "30 14 * * *",
        timezone: "Europe/Lisbon",
      })
      expect(byName["Multi schedule"]?.expectedIntervalSeconds).toBe(3600)
      expect(byName["long-grace"]?.gracePeriodSeconds).toBe(86_400)
    })

    it("warns about what it cannot import", async () => {
      const res = await post("/api/import/cronitor?dryRun=true", fixture("cronitor-monitors.json"))
      const { data } = (await res.json()) as Report
      const warn = (name: string) => data.created.find((c) => c.name === name)?.warnings.join(" ")
      expect(warn("Daily Database Backup")).toContain("notify")
      expect(warn("Daily Database Backup")).toContain("assertions")
      expect(warn("Multi schedule")).toContain("only the first schedule")
      expect(warn("long-grace")).toContain("reduced")
      expect(await monitors()).toHaveLength(0)
    })

    it("accepts a bare array and rejects other bodies", async () => {
      const bare = (fixture("cronitor-monitors.json") as { monitors: unknown[] }).monitors
      expect((await post("/api/import/cronitor?dryRun=true", bare)).status).toBe(200)
      expect((await post("/api/import/cronitor", { nope: 1 })).status).toBe(400)
    })

    it("is safe to run twice", async () => {
      await post("/api/import/cronitor", fixture("cronitor-monitors.json"))
      const again = (await (
        await post("/api/import/cronitor", fixture("cronitor-monitors.json"))
      ).json()) as Report
      expect(again.data.created).toHaveLength(0)
      expect(again.data.skipped.filter((s) => /already exists/.test(s.reason ?? ""))).toHaveLength(
        5,
      )
    })
  })

  describe("dead man's snitch", () => {
    it("maps the intervals the API documents and skips unknown ones", async () => {
      const res = await post("/api/import/dms", fixture("dms-snitches.json"))
      const { data } = (await res.json()) as Report
      expect(data.created.map((c) => c.name)).toEqual([
        "Daily Backups",
        "Hourly Emails",
        "Monthly invoices",
        "Quarter hour",
      ])
      expect(data.skipped.map((s) => s.reason)).toEqual(['unknown interval "yearly"'])
      const byName = Object.fromEntries((await monitors()).map((m) => [m.name, m]))
      expect(byName["Daily Backups"]).toMatchObject({
        expectedIntervalSeconds: 86_400,
        tags: ["production", "critical"],
        paused: false,
      })
      expect(byName["Hourly Emails"]?.expectedIntervalSeconds).toBe(3600)
      expect(byName["Quarter hour"]?.expectedIntervalSeconds).toBe(900)
      expect(byName["Monthly invoices"]).toMatchObject({
        expectedIntervalSeconds: 2_592_000,
        paused: true,
      })
    })

    it("warns about notes, alert e-mails and the check-in token", async () => {
      const res = await post("/api/import/dms?dryRun=true", fixture("dms-snitches.json"))
      const { data } = (await res.json()) as Report
      const warn = (name: string) => data.created.find((c) => c.name === name)?.warnings.join(" ")
      expect(warn("Daily Backups")).toContain("notes are not imported")
      expect(warn("Hourly Emails")).toContain("alert e-mails")
      expect(warn("Monthly invoices")).toContain("30 days")
      expect(warn("Daily Backups")).toContain("check-in token")
    })

    it("fetches with the API key as the Basic auth user and never sends it anywhere else", async () => {
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify(fixture("dms-snitches.json"))),
      )
      vi.stubGlobal("fetch", fetchMock)
      const res = await post("/api/import/dms?dryRun=true", { apiKey: "KEY123" })
      expect(res.status).toBe(200)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe("https://api.deadmanssnitch.com/v1/snitches")
      expect(new Headers(init.headers).get("authorization")).toBe(
        `Basic ${Buffer.from("KEY123:").toString("base64")}`,
      )
      expect(JSON.stringify(await res.json())).not.toContain("KEY123")
    })

    it("reports a wrong key (401) and an unreachable service (502)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("{}", { status: 401 })),
      )
      expect((await post("/api/import/dms", { apiKey: "bad" })).status).toBe(401)
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Promise.reject(new Error("down"))),
      )
      expect((await post("/api/import/dms", { apiKey: "k" })).status).toBe(502)
      expect((await post("/api/import/dms", { nope: 1 })).status).toBe(400)
    })
  })
})
