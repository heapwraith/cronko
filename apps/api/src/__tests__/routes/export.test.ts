import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

type Doc = {
  format: string
  secretsIncluded: boolean
  monitors: { name: string; slug: string; token?: string; paused: boolean; tags: string[] }[]
  tags: string[]
  channels: { name: string; type: string; config: Record<string, string> }[]
  statusPages: { slug: string; tag: string }[]
  maintenanceWindows: { name: string; target: string; targetValue: string | null }[]
}
type Report = {
  data: {
    dryRun: boolean
    created: unknown[]
    skipped: { reason?: string }[]
    channels: { created: unknown[]; skipped: { reason?: string }[] }
    statusPages: { created: unknown[]; skipped: { reason?: string }[] }
    maintenanceWindows: { created: unknown[]; skipped: { reason?: string }[] }
  }
}

const WEBHOOK = "https://discord.example.com/api/webhooks/123/very-secret"

describe("config export / import (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let viaToken: Hono

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { exportRoute } = await import("../../routes/export")
    const { importRoute } = await import("../../routes/import")
    const { monitorsRoute } = await import("../../routes/monitors")
    const { notificationsRoute } = await import("../../routes/notifications")
    const { statusPagesRoute } = await import("../../routes/status-pages")
    const { maintenanceRoute } = await import("../../routes/maintenance")
    const { settingsRoute } = await import("../../routes/settings")
    const build = (token?: boolean) => {
      const a = new Hono()
      a.use("*", async (c, next) => {
        c.set("jwtPayload" as never, { sub: "user-1", email: "a@b.c" } as never)
        if (token) c.set("apiToken" as never, { id: "t", scope: "write" } as never)
        await next()
      })
      return a
        .route("/api/export", exportRoute)
        .route("/api/import", importRoute)
        .route("/api/monitors", monitorsRoute)
        .route("/api/notifications", notificationsRoute)
        .route("/api/status-pages", statusPagesRoute)
        .route("/api/maintenance-windows", maintenanceRoute)
        .route("/api/settings", settingsRoute)
    }
    app = build()
    viaToken = build(true)
  })
  beforeEach(() => ctx.reset())

  const send = (a: Hono, method: string, path: string, body?: unknown) =>
    a.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })

  async function seed() {
    const mon = async (body: object) =>
      ((await (await send(app, "POST", "/api/monitors", body)).json()) as { data: { id: string } })
        .data
    await mon({ name: "Nightly Backup", expectedIntervalSeconds: 86_400, tags: ["prod", "db"] })
    const cron = await mon({
      name: "Report Job",
      scheduleCron: "0 3 * * *",
      timezone: "America/Sao_Paulo",
      gracePeriodSeconds: 600,
    })
    await send(app, "POST", `/api/monitors/${cron.id}/pause`)
    await send(app, "POST", "/api/notifications", {
      name: "Ops Discord",
      type: "discord",
      config: { webhookUrl: WEBHOOK },
    })
    await send(app, "POST", "/api/notifications", {
      name: "Mail",
      type: "email",
      config: { to: "ops@example.com" },
    })
    await send(app, "POST", "/api/status-pages", {
      slug: "public",
      title: "Status",
      tag: "prod",
      enabled: true,
    })
    await send(app, "POST", "/api/maintenance-windows", {
      name: "Weekly deploy",
      schedule: "0 22 * * 0",
      timezone: "UTC",
      durationMinutes: 30,
      target: "monitor",
      targetValue: cron.id,
    })
  }

  const exportDoc = async (qs = "", a = app) =>
    (await (await send(a, "GET", `/api/export${qs}`)).json()) as Doc

  it("exports configuration without history, ping tokens or secrets by default", async () => {
    await seed()
    const res = await send(app, "GET", "/api/export")
    expect(res.headers.get("content-disposition")).toContain("cronko-export.json")
    const doc = (await res.json()) as Doc

    expect(doc).toMatchObject({ format: "cronko-export", secretsIncluded: false })
    expect(doc.monitors.map((m) => m.name).sort()).toEqual(["Nightly Backup", "Report Job"])
    expect(doc.monitors.every((m) => m.token === undefined)).toBe(true)
    expect(doc.tags).toEqual(["db", "prod"])
    expect(doc.statusPages).toHaveLength(1)
    const discord = doc.channels.find((c) => c.type === "discord")
    expect(discord?.config.webhookUrl).toBe("[REDACTED]")
    expect(doc.channels.find((c) => c.type === "email")?.config.to).toBe("ops@example.com")
    expect(JSON.stringify(doc)).not.toContain("very-secret")
    // Monitor targets travel as slugs, not ids.
    expect(doc.maintenanceWindows[0]?.targetValue).toBe("report-job")
  })

  it("includes secrets only on request, from a session, and audits it", async () => {
    await seed()
    const doc = await exportDoc("?includeSecrets=true")
    expect(doc.secretsIncluded).toBe(true)
    expect(doc.channels.find((c) => c.type === "discord")?.config.webhookUrl).toBe(WEBHOOK)

    const refused = await send(viaToken, "GET", "/api/export?includeSecrets=true")
    expect(refused.status).toBe(403)
    expect(await send(viaToken, "GET", "/api/export")).toHaveProperty("status", 200)

    const { sqliteClient } = await import("@cronko/database")
    const actions = sqliteClient
      .prepare("SELECT action FROM audit_logs ORDER BY created_at")
      .all() as { action: string }[]
    await new Promise((r) => setTimeout(r, 20))
    const after = sqliteClient.prepare("SELECT action FROM audit_logs").all() as {
      action: string
    }[]
    expect(after.length).toBeGreaterThanOrEqual(actions.length)
    expect(after.map((a) => a.action)).toContain("config.exported_with_secrets")
  })

  it("round trips: export, wipe, import restores everything with fresh tokens", async () => {
    await seed()
    const original = await exportDoc("?includeSecrets=true")
    const { sqliteClient } = await import("@cronko/database")
    const oldTokens = (
      sqliteClient.prepare("SELECT token FROM monitors").all() as { token: string }[]
    ).map((r) => r.token)
    ctx.reset()

    const dry = (await (
      await send(app, "POST", "/api/import/cronko?dryRun=true", original)
    ).json()) as Report
    expect(dry.data.dryRun).toBe(true)
    expect(dry.data.created).toHaveLength(2)
    expect(dry.data.maintenanceWindows.created).toHaveLength(1)
    expect((await exportDoc()).monitors).toHaveLength(0)

    const res = (await (await send(app, "POST", "/api/import/cronko", original)).json()) as Report
    expect(res.data.created).toHaveLength(2)
    expect(res.data.channels.created).toHaveLength(2)
    expect(res.data.statusPages.created).toHaveLength(1)
    expect(res.data.maintenanceWindows.created).toHaveLength(1)

    const again = await exportDoc("?includeSecrets=true")
    const strip = ({ exportedAt: _e, ...rest }: Doc & { exportedAt?: string }) => rest
    expect(strip(again as never)).toEqual(strip(original as never))
    const newTokens = (
      sqliteClient.prepare("SELECT token FROM monitors").all() as { token: string }[]
    ).map((r) => r.token)
    expect(newTokens.some((t) => oldTokens.includes(t))).toBe(false)
    const paused = again.monitors.find((m) => m.slug === "report-job")
    expect(paused?.paused).toBe(true)
  })

  it("skips what already exists and channels whose secrets were redacted", async () => {
    await seed()
    const redacted = await exportDoc()
    const res = (await (await send(app, "POST", "/api/import/cronko", redacted)).json()) as Report
    expect(res.data.created).toHaveLength(0)
    expect(res.data.skipped).toHaveLength(2)
    expect(res.data.statusPages.skipped).toHaveLength(1)
    expect(res.data.maintenanceWindows.skipped).toHaveLength(1)
    // Both channels already exist, but the redacted one is reported as such first.
    expect(res.data.channels.skipped.some((s) => s.reason?.includes("redacted"))).toBe(true)

    ctx.reset()
    const fresh = (await (await send(app, "POST", "/api/import/cronko", redacted)).json()) as Report
    expect(fresh.data.channels.created).toHaveLength(1)
    expect(fresh.data.channels.skipped[0]?.reason).toContain("redacted")
  })

  it("rejects a body that is not a Cronko export", async () => {
    expect((await send(app, "POST", "/api/import/cronko", { monitorList: [] })).status).toBe(400)
    expect((await send(app, "POST", "/api/import/cronko", [])).status).toBe(400)
  })

  it("reports a maintenance window whose monitor is gone", async () => {
    const doc = {
      format: "cronko-export",
      maintenanceWindows: [
        {
          name: "Orphan",
          schedule: "0 1 * * *",
          timezone: "UTC",
          durationMinutes: 10,
          target: "monitor",
          targetValue: "nope",
        },
      ],
    }
    const res = (await (await send(app, "POST", "/api/import/cronko", doc)).json()) as Report
    expect(res.data.maintenanceWindows.skipped[0]?.reason).toContain("does not exist")
  })

  it("exposes the backup status to Settings", async () => {
    const res = await send(app, "GET", "/api/settings/backup")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { enabled: false, last: null } })
  })
})
