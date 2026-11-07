import { execFileSync } from "node:child_process"
import { createECDH, randomBytes } from "node:crypto"
import { mkdtempSync, readFileSync } from "node:fs"
import { createServer as createHttps, type Server } from "node:https"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Hono } from "hono"
import { importJWK, jwtVerify } from "jose"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

const hasOpenssl = (() => {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
})()

/** A browser's subscription keys: a real P-256 public key and a 16-byte auth secret. */
function browserKeys() {
  const ecdh = createECDH("prime256v1")
  ecdh.generateKeys()
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  }
}

describe("web push (real SQLite, local HTTPS push service)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let cookie = ""
  let push: Server
  let base = ""
  let hits: {
    path: string
    headers: Record<string, string | string[] | undefined>
    body: Buffer
  }[] = []
  let respond = 201

  beforeAll(async () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0" // the test push service is self-signed
    if (hasOpenssl) {
      const dir = mkdtempSync(join(tmpdir(), "cronko-tls-"))
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "ec",
          "-pkeyopt",
          "ec_paramgen_curve:prime256v1",
          "-nodes",
          "-keyout",
          join(dir, "k.pem"),
          "-out",
          join(dir, "c.pem"),
          "-subj",
          "/CN=127.0.0.1",
          "-days",
          "1",
        ],
        { stdio: "ignore" },
      )
      push = createHttps(
        { key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) },
        (req, res) => {
          const chunks: Buffer[] = []
          req.on("data", (c) => chunks.push(c))
          req.on("end", () => {
            hits.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) })
            res.statusCode = respond
            res.end()
          })
        },
      )
      await new Promise<void>((r) => push.listen(0, "127.0.0.1", r))
      base = `https://127.0.0.1:${(push.address() as AddressInfo).port}`
    }
    ctx = await setupTestDb()
    ;({ app } = (await import("../../app")) as unknown as { app: Hono })
    const { createUser } = await import("@cronko/database/queries/users")
    const { hashPassword } = await import("../../services/auth")
    await createUser({ email: "ops@example.com", passwordHash: await hashPassword("pw-123456") })
  })
  afterAll(() => new Promise<void>((r) => (push ? push.close(() => r()) : r())))

  beforeEach(async () => {
    ctx.reset()
    hits = []
    respond = 201
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ email: "ops@example.com", password: "pw-123456" }),
    })
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
  })

  const call = (method: string, path: string, body?: unknown) =>
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
  const createChannel = (config: unknown) =>
    call("POST", "/api/notifications", { name: "My phone", type: "webpush", config })

  it("hands out a stable public key, made on first use", async () => {
    const a = (await (await call("GET", "/api/notifications/webpush/key")).json()) as {
      data: { publicKey: string }
    }
    const b = (await (await call("GET", "/api/notifications/webpush/key")).json()) as {
      data: { publicKey: string }
    }
    expect(a.data.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/)
    expect(b.data.publicKey).toBe(a.data.publicKey)
    expect((await app.request("/api/notifications/webpush/key")).status).toBe(401)
  })

  it("never serves the private key", async () => {
    await call("GET", "/api/notifications/webpush/key")
    const { getSetting } = await import("@cronko/database/queries/settings")
    const priv = (await getSetting("vapid_private_key")) ?? ""
    expect(priv.length).toBeGreaterThan(30)
    for (const path of ["/api/settings", "/api/notifications", "/api/export"]) {
      expect(await (await call("GET", path)).text()).not.toContain(priv)
    }
  })

  it("validates the subscription when a channel is created", async () => {
    const keys = browserKeys()
    expect((await createChannel({ endpoint: "https://push.example/abc", keys })).status).toBe(201)
    expect((await createChannel({ endpoint: "http://push.example/abc", keys })).status).toBe(400)
    expect((await createChannel({ endpoint: "not a url", keys })).status).toBe(400)
    expect((await createChannel({ endpoint: "https://push.example/abc" })).status).toBe(400)
    expect(
      (
        await createChannel({
          endpoint: "https://push.example/abc",
          keys: { p256dh: "x", auth: "y" },
        })
      ).status,
    ).toBe(400)
  })

  describe.skipIf(!hasOpenssl)("delivery", () => {
    const channel = async (endpoint: string) => {
      const { deliver } = await import("../../services/channels")
      return {
        deliver,
        row: {
          id: "c",
          name: "n",
          type: "webpush",
          enabled: true,
          config: { endpoint, keys: browserKeys() },
          createdAt: new Date(),
        } as never,
      }
    }

    it("sends an encrypted, VAPID-signed message that carries no plain text", async () => {
      const { deliver, row } = await channel(`${base}/push/abc`)
      await deliver(row, "down", "etl caiu https://cronko.test/monitors/1", "etl")
      expect(hits).toHaveLength(1)
      const hit = hits[0]
      expect(hit?.path).toBe("/push/abc")
      expect(hit?.headers["content-encoding"]).toBe("aes128gcm")
      expect(hit?.headers.ttl).toBe("3600")
      expect(hit?.headers.urgency).toBe("high")
      // Encrypted: the title and the text are not readable in the body.
      expect(hit?.body.toString("latin1")).not.toContain("etl")

      // The Authorization header is a VAPID JWT signed with our private key.
      const auth = String(hit?.headers.authorization)
      const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(auth) ?? []
      const publicKey = (await (await call("GET", "/api/notifications/webpush/key")).json()) as {
        data: { publicKey: string }
      }
      expect(key).toBe(publicKey.data.publicKey)
      const raw = Buffer.from(publicKey.data.publicKey, "base64url")
      const jwk = {
        kty: "EC",
        crv: "P-256",
        x: raw.subarray(1, 33).toString("base64url"),
        y: raw.subarray(33, 65).toString("base64url"),
      }
      const verified = await jwtVerify(token ?? "", await importJWK(jwk, "ES256"), {
        audience: base,
      })
      expect(verified.payload.sub).toBeTruthy()
    })

    it("uses normal urgency for a recovery", async () => {
      const { deliver, row } = await channel(`${base}/push/abc`)
      await deliver(row, "recovered", "etl voltou", "etl")
      expect(hits[0]?.headers.urgency).toBe("normal")
    })

    it("treats 404 and 410 as a dead subscription (no retry) and 5xx and 429 as retryable", async () => {
      const { deliver, row } = await channel(`${base}/push/abc`)
      const outcome = async (status: number) => {
        respond = status
        return deliver(row, "down", "x", "etl").then(
          () => null,
          (e) => e as { retryable: boolean; message: string },
        )
      }
      expect(await outcome(410)).toMatchObject({ retryable: false })
      expect(await outcome(404)).toMatchObject({ retryable: false })
      expect(await outcome(400)).toMatchObject({ retryable: false })
      expect(await outcome(503)).toMatchObject({ retryable: true })
      expect(await outcome(429)).toMatchObject({ retryable: true })
      const gone = await outcome(410)
      expect(gone?.message).not.toContain(base)
      expect(gone?.message).toContain("expired")
    })

    it("reports an unreachable push service as retryable, without the endpoint", async () => {
      const { deliver, row } = await channel("https://127.0.0.1:9/push/secret-capability")
      const err = (await deliver(row, "down", "x", "etl").catch((e) => e)) as {
        retryable: boolean
        message: string
      }
      expect(err.retryable).toBe(true)
      expect(err.message).not.toContain("secret-capability")
    })
  })
})
