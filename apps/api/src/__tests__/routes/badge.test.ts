import type { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { BADGE_COLORS, contrastWithWhite, splitFormat } from "../../services/badge"
import { setupTestDb } from "../helpers/testDb"

describe("badges (full app, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let cookie = ""
  let monitors: typeof import("@cronko/database/queries/monitors")

  beforeAll(async () => {
    ctx = await setupTestDb()
    ;({ app } = (await import("../../app")) as unknown as { app: Hono })
    monitors = await import("@cronko/database/queries/monitors")
    const { createUser } = await import("@cronko/database/queries/users")
    const { hashPassword } = await import("../../services/auth")
    await createUser({ email: "ops@example.com", passwordHash: await hashPassword("pw-123456") })
  })

  beforeEach(async () => {
    ctx.reset()
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ email: "ops@example.com", password: "pw-123456" }),
    })
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
  })

  const admin = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        cookie,
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        origin: "http://localhost",
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })

  async function seed(name: string, tags: string[], status = "healthy") {
    const m = await monitors.createMonitor({
      id: crypto.randomUUID(),
      name,
      slug: name,
      token: `secret-token-${name}`,
      expectedIntervalSeconds: 3600,
      gracePeriodSeconds: 60,
      tags,
      now: new Date(Date.now() - 86_400_000),
    })
    if (status !== "pending")
      await monitors.transitionMonitorStatus(m.id, "pending", status as never)
    return m
  }

  async function publish(tag: string, enabled = true) {
    const res = await admin("POST", "/api/status-pages", { slug: `p-${tag}`, title: "T", tag })
    const page = ((await res.json()) as { data: { id: string } }).data
    if (enabled) await admin("PATCH", `/api/status-pages/${page.id}`, { enabled: true })
  }

  it("keeps the per-monitor badge and adds .json and .shields.json", async () => {
    await seed("etl", [], "missed")
    const svg = await app.request("/badge/secret-token-etl")
    expect(svg.headers.get("content-type")).toContain("image/svg+xml")
    expect(await svg.text()).toContain("missed")

    const json = await app.request("/badge/secret-token-etl.json")
    expect(await json.json()).toEqual({ label: "cronko", status: "missed" })

    const shields = await app.request("/badge/secret-token-etl.shields.json")
    expect(await shields.json()).toEqual({
      schemaVersion: 1,
      label: "cronko",
      message: "missed",
      color: "orange",
    })
    expect((await app.request("/badge/nope")).status).toBe(404)
    expect((await app.request("/badge/nope.json")).status).toBe(404)
  })

  it("uses the three-state wording with ?states=simple", async () => {
    await seed("a", [], "missed")
    await seed("b", [], "failed")
    await seed("c", [], "healthy")
    const msg = async (n: string) =>
      (
        (await (await app.request(`/badge/secret-token-${n}.json?states=simple`)).json()) as {
          status: string
        }
      ).status
    expect([await msg("a"), await msg("b"), await msg("c")]).toEqual(["late", "down", "up"])
  })

  it("aggregates a published tag: worst state wins and paused is ignored", async () => {
    await seed("a", ["prod"], "healthy")
    await seed("b", ["prod"], "paused")
    await seed("other", ["staging"], "down")
    await publish("prod")

    const body = (await (await app.request("/badge/tag/prod.json")).json()) as Record<
      string,
      unknown
    >
    expect(body).toEqual({
      label: "prod",
      status: "up",
      counts: { up: 1, late: 0, down: 0, paused: 1 },
      total: 2,
    })

    await seed("c", ["prod"], "missed")
    expect(
      ((await (await app.request("/badge/tag/prod.json")).json()) as { status: string }).status,
    ).toBe("late")
    await seed("d", ["prod"], "failed")
    expect(
      ((await (await app.request("/badge/tag/prod.json")).json()) as { status: string }).status,
    ).toBe("down")
  })

  it("serves a tag badge only while its status page is on, with identical 404s", async () => {
    await seed("a", ["prod"])
    await seed("b", ["draft"])
    await publish("draft", false)
    await publish("empty")

    const notFound = await Promise.all(
      ["prod", "draft", "empty", "unknown"].map(async (t) => {
        const r = await app.request(`/badge/tag/${t}`)
        return [r.status, await r.text()]
      }),
    )
    expect(new Set(notFound.map((r) => JSON.stringify(r))).size).toBe(1)
    expect(notFound[0]?.[0]).toBe(404)

    await publish("prod")
    expect((await app.request("/badge/tag/prod")).status).toBe(200)
  })

  it("never leaks monitor names, tokens or ids, and sets a short public cache", async () => {
    const m = await seed("billing-secret-job", ["prod"])
    await publish("prod")
    for (const path of [
      "/badge/tag/prod",
      "/badge/tag/prod.json",
      "/badge/tag/prod.shields.json",
    ]) {
      const res = await app.request(path)
      const text = await res.text()
      expect(text).not.toContain("billing-secret-job")
      expect(text).not.toContain("secret-token")
      expect(text).not.toContain(m.id)
      expect(res.headers.get("cache-control")).toBe("public, max-age=60")
    }
  })

  it("escapes the tag in the SVG", async () => {
    // Tags are normalised on write, but the renderer must not trust that.
    const { renderSvg } = await import("../../services/badge")
    const svg = renderSvg({ label: `"><script>x</script>&`, message: "up", color: "green" })
    expect(svg).not.toContain("<script>")
    expect(svg).toContain("&#60;script&#62;")
  })

  it("keeps white text at WCAG AA contrast on every badge colour", () => {
    for (const [name, hex] of Object.entries(BADGE_COLORS)) {
      expect(contrastWithWhite(hex), name).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("splits format suffixes off a name", () => {
    expect(splitFormat("abc")).toEqual({ name: "abc", format: "svg" })
    expect(splitFormat("abc.json")).toEqual({ name: "abc", format: "json" })
    expect(splitFormat("abc.shields.json")).toEqual({ name: "abc", format: "shields" })
  })
})
