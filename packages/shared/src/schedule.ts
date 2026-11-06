import { Cron } from "croner"

/** Cron patterns Cronko accepts: 5 fields or an @nickname (no seconds field). */
export function isSupportedPattern(pattern: string): boolean {
  const trimmed = pattern.trim()
  return trimmed.startsWith("@") || trimmed.split(/\s+/).length === 5
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

function build(pattern: string, timezone?: string | null): Cron | null {
  if (!isSupportedPattern(pattern)) return null
  if (timezone && !isValidTimezone(timezone)) return null
  try {
    return new Cron(pattern.trim(), { timezone: timezone || "UTC" })
  } catch {
    return null
  }
}

/** True when the pattern (and timezone, if given) can be scheduled. */
export function isValidSchedule(pattern: string, timezone?: string | null): boolean {
  return build(pattern, timezone) !== null
}

/** First scheduled time strictly after `after`, or null when invalid or never. */
export function nextRun(pattern: string, timezone: string | null | undefined, after: Date) {
  return build(pattern, timezone)?.nextRun(after) ?? null
}

export function nextRuns(
  pattern: string,
  timezone: string | null | undefined,
  after: Date,
  count: number,
): Date[] {
  return build(pattern, timezone)?.nextRuns(count, after) ?? []
}

/** Gap between the next two runs: the cron monitor's "expected interval". */
export function schedulePeriodSeconds(
  pattern: string,
  timezone: string | null | undefined,
  after: Date,
): number | null {
  const [a, b] = nextRuns(pattern, timezone, after, 2)
  return a && b ? Math.max(1, Math.round((b.getTime() - a.getTime()) / 1000)) : null
}
