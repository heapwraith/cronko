import type { AddressInfo } from "node:net"
import { Hono } from "hono"
import { createTransport } from "nodemailer"
import type { SMTPServer } from "smtp-server"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

vi.mock("../../services/channels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/channels")>()),
  deliver: async () => {},
}))

const DOMAIN = "ping.example.test"

describe("ping by e-mail (real SMTP session, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let server: SMTPServer
  let port: number
  let hb: typeof import("@cronko/database/queries/heartbeats")
  let monitors: typeof import("@cronko/database/queries/monitors")

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { createInboundEmailServer } = await import("../../services/inbound-email")
    const { monitorsRoute } = await import("../../routes/monitors")
    hb = await import("@cronko/database/queries/heartbeats")
    monitors = await import("@cronko/database/queries/monitors")
    app = new Hono().route("/api/monitors", monitorsRoute)
    server = createInboundEmailServer({ port: 0, host: "127.0.0.1", domain: DOMAIN })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    port = (server.server.address() as AddressInfo).port
  })

  afterAll(() => new Promise<void>((r) => server.close(() => r())))
  beforeEach(() => ctx.reset())

  const mailer = () => createTransport({ host: "127.0.0.1", port, secure: false, ignoreTLS: true })
  const send = (to: string, subject: string, text = "report") =>
    mailer().sendMail({ from: "nas@acme.test", to, subject, text })

  async function monitor(body: Record<string, unknown> = {}) {
    const res = await app.request("/api/monitors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "nas-backup", expectedIntervalSeconds: 86_400, ...body }),
    })
    const { data } = (await res.json()) as { data: { id: string; token: string } }
    return data
  }

  it("turns a message into a ping, keeping sender, subject and text as output", async () => {
    const m = await monitor()
    await send(`${m.token}@${DOMAIN}`, "Backup completed", "42 files copied")
    const last = await hb.findLatestHeartbeat(m.id)
    expect(last?.body).toBe("From: nas@acme.test\nSubject: Backup completed\n\n42 files copied")
    expect(last?.userAgent).toBe("e-mail")
    expect(last?.exitCode).toBeNull()
    expect((await monitors.findMonitorById(m.id))?.status).toBe("healthy")
  })

  it("+fail and a failure keyword in the subject both mark the run failed", async () => {
    const a = await monitor({ name: "a" })
    await send(`${a.token}+fail@${DOMAIN}`, "whatever")
    expect((await monitors.findMonitorById(a.id))?.status).toBe("failed")

    const b = await monitor({ name: "b", emailFailureKeywords: [" ERROR ", "falhou"] })
    await send(`${b.token}@${DOMAIN}`, "Backup finished with 0 warnings")
    expect((await monitors.findMonitorById(b.id))?.status).toBe("healthy")
    await send(`${b.token}@${DOMAIN}`, "Backup finished with Error 5")
    expect((await monitors.findMonitorById(b.id))?.status).toBe("failed")
    expect((await hb.findLatestHeartbeat(b.id))?.exitCode).toBe(1)
  })

  it("normalizes keywords on save", async () => {
    const m = await monitor({ emailFailureKeywords: [" Error", "error", ""] })
    expect((await monitors.findMonitorById(m.id))?.emailFailureKeywords).toEqual(["error"])
  })

  it("rejects unknown tokens, other domains (no relaying) and unknown suffixes at RCPT time", async () => {
    const m = await monitor()
    const rejected = async (to: string) => {
      const err = (await send(to, "x").catch((e: unknown) => e)) as { responseCode?: number }
      return err.responseCode
    }
    expect(await rejected(`00000000-0000-4000-8000-000000000000@${DOMAIN}`)).toBe(550)
    expect(await rejected(`${m.token}@elsewhere.test`)).toBe(550)
    expect(await rejected(`${m.token}+start@${DOMAIN}`)).toBe(550)
    expect(await rejected(`postmaster@${DOMAIN}`)).toBe(550)
    expect(await hb.findLatestHeartbeat(m.id)).toBeUndefined()
  })

  it("refuses messages over the size limit", async () => {
    const m = await monitor()
    const err = (await send(`${m.token}@${DOMAIN}`, "big", "x".repeat(1_100_000)).catch(
      (e: unknown) => e,
    )) as { responseCode?: number }
    expect(err.responseCode).toBe(552)
    expect(await hb.findLatestHeartbeat(m.id)).toBeUndefined()
  })
})
