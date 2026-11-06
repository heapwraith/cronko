import type { Heartbeat } from "./types"

export function calculateUptime(
  heartbeats: Heartbeat[],
  monitor: { expectedIntervalSeconds: number },
): number {
  if (heartbeats.length === 0) {
    return 0
  }

  const now = Date.now()
  const windowStart = now - 24 * 60 * 60 * 1000

  const recentHeartbeats = heartbeats.filter((hb) => hb.receivedAt.getTime() >= windowStart)

  const expectedHeartbeats = (24 * 60 * 60) / monitor.expectedIntervalSeconds

  if (expectedHeartbeats === 0) {
    return 0
  }

  const uptime = (recentHeartbeats.length / expectedHeartbeats) * 100

  return Math.min(Math.round(uptime * 100) / 100, 100)
}

export function formatDuration(ms: number): string {
  if (ms < 0) {
    return "0s"
  }

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remainingHours = hours % 24
    if (remainingHours > 0) {
      return `${days}d ${remainingHours}h`
    }
    return `${days}d`
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`
    }
    return `${hours}h`
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    if (remainingSeconds > 0) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${minutes}m`
  }

  return `${seconds}s`
}

export function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" })

  if (diff < 60_000) return rtf.format(-Math.round(diff / 1000), "seconds")
  if (diff < 3_600_000) return rtf.format(-Math.round(diff / 60_000), "minutes")
  if (diff < 86_400_000) return rtf.format(-Math.round(diff / 3_600_000), "hours")
  return rtf.format(-Math.round(diff / 86_400_000), "days")
}

export function groupHeartbeatsByDay(
  heartbeats: Heartbeat[],
  days: number,
): Map<string, Heartbeat[]> {
  const now = new Date()
  const map = new Map<string, Heartbeat[]>()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = date.toISOString().split("T")[0] ?? date.toISOString().slice(0, 10)
    map.set(key, [])
  }

  for (const hb of heartbeats) {
    const key =
      hb.receivedAt.toISOString().split("T")[0] ?? hb.receivedAt.toISOString().slice(0, 10)
    const existing = map.get(key)
    if (existing) {
      existing.push(hb)
    }
  }

  return map
}
