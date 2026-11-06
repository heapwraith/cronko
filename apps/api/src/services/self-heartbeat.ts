import { sqliteClient } from "@cronko/database"
import { logger } from "../lib/logger"
import { schedulerMetrics } from "./scheduler"

/** A scheduler that has not ticked for this long is considered stuck. */
const MAX_TICK_AGE_MS = 5 * 60_000

export type SelfHeartbeatDeps = {
  url: string
  now?: () => number
  lastTickAt?: () => number
  dbUp?: () => boolean
  fetchFn?: typeof fetch
}

/**
 * "Monitor the monitor": ping an external dead-man's switch (another Cronko,
 * Healthchecks.io...). The ping is sent only while Cronko is actually working
 * (database reachable, scheduler ticking), so the *absence* of pings is what
 * tells you Cronko stopped or got stuck, not just that the process is alive.
 */
export async function sendSelfHeartbeat(
  deps: SelfHeartbeatDeps,
): Promise<"sent" | "skipped" | "failed"> {
  const now = (deps.now ?? Date.now)()
  const lastTick = (deps.lastTickAt ?? (() => schedulerMetrics.lastTickAt))()
  const dbUp =
    deps.dbUp ??
    (() => {
      try {
        sqliteClient.prepare("SELECT 1").get()
        return true
      } catch {
        return false
      }
    })

  if (!dbUp() || lastTick === 0 || now - lastTick > MAX_TICK_AGE_MS) {
    logger.warn({ lastTickAt: lastTick }, "self heartbeat skipped: scheduler or database unhealthy")
    return "skipped"
  }

  try {
    const res = await (deps.fetchFn ?? fetch)(deps.url, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "cronko-self-heartbeat" },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return "sent"
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "self heartbeat failed")
    return "failed"
  }
}

let timer: ReturnType<typeof setInterval> | undefined

export function startSelfHeartbeat(url: string | undefined, intervalSeconds: number) {
  if (!url) return
  void sendSelfHeartbeat({ url })
  timer = setInterval(() => void sendSelfHeartbeat({ url }), intervalSeconds * 1000)
  timer.unref()
  logger.info({ intervalSeconds }, "self heartbeat enabled")
}

export function stopSelfHeartbeat() {
  if (timer) clearInterval(timer)
  timer = undefined
}
