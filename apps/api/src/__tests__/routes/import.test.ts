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
})
