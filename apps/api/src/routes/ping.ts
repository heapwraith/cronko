import type { Context } from "hono"
import { Hono } from "hono"
import { clientIp } from "../lib/clientIp"
import { rateLimit } from "../middleware/rateLimit"
import { processHeartbeat } from "../services/heartbeat"

export const pingRoute = new Hono()

const MAX_BODY_LENGTH = 10_000

type PingKind = "success" | "start" | "finish" | "fail"

// "/:token/*" also matches "/:token", so one registration counts every ping once.
pingRoute.use("/:token/*", rateLimit)

function intParam(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number.parseInt(value, 10)
  return Number.isNaN(n) ? undefined : n
}

/** Optional job output sent in a POST body (plain text, or JSON with body/log/text). */
async function readBody(c: Context): Promise<{ body?: string; tooLarge?: true }> {
  if (c.req.method !== "POST") return {}

  try {
    const contentType = c.req.header("content-type") ?? ""
    let raw: string | undefined

    if (contentType.includes("application/json")) {
      const json = await c.req.json()
      const candidate = json.body ?? json.log ?? json.text
      raw = typeof candidate === "string" ? candidate : undefined
    } else if (contentType.includes("text/plain")) {
      raw = await c.req.text()
    }

    if (raw === undefined) return {}
    if (raw.length > MAX_BODY_LENGTH) return { tooLarge: true }
    // Stored verbatim: it is job output, and the UI renders it as text.
    return { body: raw.trim() }
  } catch {
    return {} // malformed body: ignore, the ping itself still counts
  }
}

function handle(kind: PingKind) {
  return async (c: Context) => {
    const { body, tooLarge } = await readBody(c)
    if (tooLarge) return c.json({ error: "Body too large", code: "PAYLOAD_TOO_LARGE" }, 413)

    const durationMs = intParam(c.req.query("d"))
    let exitCode = intParam(c.req.query("exit"))
    // An explicit failure with no exit code is reported as 1 so history shows it.
    if (kind === "fail") exitCode ??= 1

    const userAgent = c.req.header("user-agent")
    const result = await processHeartbeat(c.req.param("token") ?? "", {
      sourceIp: clientIp(c),
      ...(userAgent !== undefined && { userAgent }),
      ...(durationMs !== undefined && { durationMs }),
      ...(exitCode !== undefined && { exitCode }),
      ...(body !== undefined && { body }),
      ...(kind === "start" && { pulseType: "start" as const }),
      ...(kind === "finish" && { pulseType: "finish" as const }),
      ...(kind === "fail" && { failed: true }),
    })

    if (!result.ok) return c.json({ error: result.error }, result.status as 404)
    return c.json(result.data)
  }
}

for (const [suffix, kind] of [
  ["", "success"],
  ["/start", "start"],
  ["/finish", "finish"],
  ["/fail", "fail"],
] as const) {
  pingRoute.get(`/:token${suffix}`, handle(kind))
  pingRoute.post(`/:token${suffix}`, handle(kind))
}
