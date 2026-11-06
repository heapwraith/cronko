import type { Context } from "hono"
import { Hono } from "hono"
import { clientIp } from "../lib/clientIp"
import { rateLimit } from "../middleware/rateLimit"
import { processHeartbeat } from "../services/heartbeat"

export const pingRoute = new Hono()

const MAX_BODY_LENGTH = 10_000

pingRoute.use("/:token", rateLimit)

async function handlePing(c: Context) {
  const token = c.req.param("token")
  const durationMs = c.req.query("d")
  const exitCode = c.req.query("exit")
  const sourceIp = clientIp(c)
  const userAgent = c.req.header("user-agent")
  let body: string | undefined

  if (c.req.method === "POST") {
    try {
      const contentType = c.req.header("content-type") ?? ""
      let rawBody: string | undefined

      if (contentType.includes("application/json")) {
        const json = await c.req.json()
        const candidate = json.body ?? json.log ?? json.text
        rawBody = typeof candidate === "string" ? candidate : undefined
      } else if (contentType.includes("text/plain")) {
        rawBody = await c.req.text()
      }

      if (rawBody !== undefined) {
        if (rawBody.length > MAX_BODY_LENGTH) {
          return c.json({ error: "Body too large", code: "PAYLOAD_TOO_LARGE" }, 413)
        }
        // Stored verbatim: it is job output, and the UI renders it as text.
        body = rawBody.trim()
      }
    } catch {
      // Body parsing failed — ignore malformed input
    }
  }

  const parsedDurationMs = durationMs !== undefined ? parseInt(durationMs, 10) : undefined
  const parsedExitCode = exitCode !== undefined ? parseInt(exitCode, 10) : undefined

  const result = await processHeartbeat(token ?? "", {
    ...(sourceIp !== undefined && { sourceIp }),
    ...(userAgent !== undefined && { userAgent }),
    ...(parsedDurationMs !== undefined &&
      !Number.isNaN(parsedDurationMs) && { durationMs: parsedDurationMs }),
    ...(parsedExitCode !== undefined &&
      !Number.isNaN(parsedExitCode) && { exitCode: parsedExitCode }),
    ...(body !== undefined && { body }),
  })

  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 404)
  }

  return c.json(result.data)
}

pingRoute.get("/:token", handlePing)
pingRoute.post("/:token", handlePing)

async function handlePulseStart(c: Context) {
  const token = c.req.param("token")
  const sourceIp = clientIp(c)
  const userAgent = c.req.header("user-agent")

  const result = await processHeartbeat(token ?? "", {
    sourceIp,
    ...(userAgent !== undefined && { userAgent }),
    pulseType: "start",
  })

  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 404)
  }

  return c.json(result.data)
}

pingRoute.post("/:token/start", handlePulseStart)
pingRoute.get("/:token/start", handlePulseStart)

async function handlePulseFinish(c: Context) {
  const token = c.req.param("token")
  const durationMs = c.req.query("d")
  const exitCode = c.req.query("exit")
  const sourceIp = clientIp(c)
  const userAgent = c.req.header("user-agent")

  const parsedDurationMs = durationMs !== undefined ? parseInt(durationMs, 10) : undefined
  const parsedExitCode = exitCode !== undefined ? parseInt(exitCode, 10) : undefined

  const result = await processHeartbeat(token ?? "", {
    sourceIp,
    ...(userAgent !== undefined && { userAgent }),
    ...(parsedDurationMs !== undefined &&
      !Number.isNaN(parsedDurationMs) && { durationMs: parsedDurationMs }),
    ...(parsedExitCode !== undefined &&
      !Number.isNaN(parsedExitCode) && { exitCode: parsedExitCode }),
    pulseType: "finish",
  })

  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 404)
  }

  return c.json(result.data)
}

pingRoute.post("/:token/finish", handlePulseFinish)
pingRoute.get("/:token/finish", handlePulseFinish)
