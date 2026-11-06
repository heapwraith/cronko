/**
 * Public status page logic: what a visitor may see, and daily availability.
 *
 * Availability is the share of each UTC day with no open incident. Days before the
 * monitor existed have no data (null), so a new monitor does not look 100% up for
 * days it was not watching.
 */

export const STATUS_DAYS = 90
export const STATUS_INCIDENT_DAYS = 30
const DAY_MS = 86_400_000

/** The only states a visitor sees. Internal detail (failed vs down) is not exposed. */
export type PublicState = "operational" | "degraded" | "down" | "paused"

export function publicState(status: string): PublicState {
  switch (status) {
    case "down":
    case "failed":
      return "down"
    case "missed":
      return "degraded"
    case "paused":
      return "paused"
    default:
      // healthy and pending (no ping yet, nothing wrong reported)
      return "operational"
  }
}

/** The page headline: the worst state among monitors that are not paused. */
export function overallState(states: readonly PublicState[]): PublicState {
  const active = states.filter((s) => s !== "paused")
  if (active.includes("down")) return "down"
  if (active.includes("degraded")) return "degraded"
  if (active.length === 0 && states.length > 0) return "paused"
  return "operational"
}

export interface IncidentSpan {
  startedAt: Date
  resolvedAt: Date | null
}

export interface DayUptime {
  /** UTC date, YYYY-MM-DD. */
  date: string
  /** 0..1, or null when the monitor did not exist yet that day. */
  uptime: number | null
}

function utcDayStart(t: number): number {
  const d = new Date(t)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Merge overlapping incident spans so downtime is never counted twice. */
function mergeSpans(spans: readonly [number, number][]): [number, number][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

/** One entry per UTC day, oldest first, ending with today (partial up to `now`). */
export function dailyUptime(input: {
  incidents: readonly IncidentSpan[]
  createdAt: Date
  now: Date
  days?: number
}): DayUptime[] {
  const days = input.days ?? STATUS_DAYS
  const now = input.now.getTime()
  const created = input.createdAt.getTime()
  const spans = mergeSpans(
    input.incidents.map((i) => [
      i.startedAt.getTime(),
      Math.min(i.resolvedAt?.getTime() ?? now, now),
    ]),
  )

  const today = utcDayStart(now)
  const out: DayUptime[] = []
  for (let k = days - 1; k >= 0; k--) {
    const dayStart = today - k * DAY_MS
    const date = new Date(dayStart).toISOString().slice(0, 10)
    // The watched part of the day: from creation (or midnight) to midnight (or now).
    const from = Math.max(dayStart, created)
    const to = Math.min(dayStart + DAY_MS, now)
    if (to <= from) {
      out.push({ date, uptime: null })
      continue
    }
    let down = 0
    for (const [s, e] of spans) down += Math.max(0, Math.min(e, to) - Math.max(s, from))
    out.push({ date, uptime: 1 - down / (to - from) })
  }
  return out
}

/** Average over the days that have data, weighting each day equally; null if none. */
export function overallUptime(days: readonly DayUptime[]): number | null {
  const known = days.filter((d): d is { date: string; uptime: number } => d.uptime !== null)
  if (known.length === 0) return null
  return known.reduce((sum, d) => sum + d.uptime, 0) / known.length
}

/** Lowercase letters, digits and hyphens; used in /status/<slug>. */
export const STATUS_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/
