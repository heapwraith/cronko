import { findMonitorBySlug, pauseMonitor } from "@cronko/database/queries/monitors"
import { DEFAULT_GRACE_PERIOD_SECONDS } from "@cronko/shared/constants"
import { createMonitorSchema, insertMonitor, slugFor } from "../routes/monitors"

/**
 * Importers for monitors from other tools. Each source is mapped to the input of
 * POST /api/monitors, so imported monitors pass the same validation and get the
 * same defaults as hand-made ones. Nothing is invented: what a source has no
 * equivalent for is reported in `warnings`.
 */

export type ImportCandidate = {
  /** Name as the source calls it, for the report. */
  source: string
  /** Why this entry cannot be imported at all. */
  skip?: string
  input?: Record<string, unknown>
  paused?: boolean
  warnings: string[]
}

export type ImportEntry = {
  source: string
  name?: string
  warnings: string[]
  reason?: string
  id?: string
}

export type ImportReport = {
  dryRun: boolean
  created: ImportEntry[]
  skipped: ImportEntry[]
}

const MAX_GRACE = 86_400

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/**
 * Healthchecks.io `GET /api/v3/checks/` items. `tags` is a space-separated string,
 * `timeout` (seconds) is present for simple checks, `schedule` + `tz` for cron ones,
 * `grace` is in seconds and `status: "paused"` marks a paused check.
 */
export function mapHealthchecks(checks: unknown[]): ImportCandidate[] {
  return checks.map((raw, i) => {
    if (!isRecord(raw)) return { source: `#${i + 1}`, skip: "not an object", warnings: [] }
    const name =
      (typeof raw.name === "string" && raw.name.trim()) ||
      (typeof raw.slug === "string" && raw.slug.trim()) ||
      ""
    const source = name || `#${i + 1}`
    const warnings: string[] = []
    if (!name) return { source, skip: "check has no name or slug", warnings }

    const input: Record<string, unknown> = { name }
    if (typeof raw.tags === "string") {
      const tags = raw.tags.split(/\s+/).filter(Boolean)
      if (tags.length) input.tags = tags
    }

    if (typeof raw.schedule === "string" && raw.schedule.trim()) {
      input.scheduleCron = raw.schedule.trim()
      if (typeof raw.tz === "string" && raw.tz) input.timezone = raw.tz
    } else if (typeof raw.timeout === "number") {
      input.expectedIntervalSeconds = raw.timeout
    } else {
      return { source, skip: "check has neither timeout nor schedule", warnings }
    }

    if (typeof raw.grace === "number") {
      if (raw.grace > MAX_GRACE) {
        warnings.push(`grace ${raw.grace}s reduced to ${MAX_GRACE}s`)
        input.gracePeriodSeconds = MAX_GRACE
      } else {
        input.gracePeriodSeconds = raw.grace
      }
    }

    const dropped = ["start_kw", "success_kw", "failure_kw"].filter(
      (k) => typeof raw[k] === "string" && raw[k],
    )
    if (dropped.length) warnings.push(`keyword filters not imported (${dropped.join(", ")})`)
    if (typeof raw.channels === "string" && raw.channels) {
      warnings.push("integrations are not imported; add notification channels in Cronko")
    }

    return { source, input, paused: raw.status === "paused", warnings }
  })
}

/** Accepts the API response ({"checks": [...]}) or a bare array of checks. */
export function extractHealthchecksChecks(doc: unknown): unknown[] | null {
  if (Array.isArray(doc)) return doc
  if (isRecord(doc) && Array.isArray(doc.checks)) return doc.checks
  return null
}

/**
 * Uptime Kuma backup (`{ version, monitorList: [...] }`). Only `push` monitors
 * map to a dead-man's switch; every other type is an active check and is skipped.
 * `interval` is in seconds, `active` is 1/0 and `tags` is `[{ name, value }]`
 * in backups from 1.7 on.
 */
export function mapKuma(monitorList: unknown[]): ImportCandidate[] {
  return monitorList.map((raw, i) => {
    if (!isRecord(raw)) return { source: `#${i + 1}`, skip: "not an object", warnings: [] }
    const name = typeof raw.name === "string" ? raw.name.trim() : ""
    const source = name || `#${i + 1}`
    const warnings: string[] = []
    if (raw.type !== "push") {
      return {
        source,
        skip: `type "${String(raw.type)}" is an active check; only push monitors are imported`,
        warnings,
      }
    }
    if (!name) return { source, skip: "monitor has no name", warnings }
    if (typeof raw.interval !== "number") {
      return { source, skip: "monitor has no interval", warnings }
    }

    const tagNames: string[] = []
    if (Array.isArray(raw.tags)) {
      for (const t of raw.tags) {
        if (typeof t === "string") tagNames.push(t)
        else if (isRecord(t) && typeof t.name === "string") tagNames.push(t.name)
      }
    }

    warnings.push("Kuma's push token is not reused; the new ping URL is on the monitor page")
    return {
      source,
      input: {
        name,
        expectedIntervalSeconds: raw.interval,
        gracePeriodSeconds: DEFAULT_GRACE_PERIOD_SECONDS,
        ...(tagNames.length && { tags: tagNames }),
      },
      paused: raw.active === 0 || raw.active === false,
      warnings,
    }
  })
}

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  d: 86_400,
  day: 86_400,
  days: 86_400,
}

/**
 * The three schedule forms Cronitor documents for jobs and heartbeats: a cron
 * expression, an interval ("every 5 minutes", "every 30s") and a time of day ("at 14:30").
 */
export function parseCronitorSchedule(
  expr: string,
): { scheduleCron: string } | { expectedIntervalSeconds: number } | null {
  const text = expr.trim()
  const every = /^every\s+(\d+)\s*([a-z]+)$/i.exec(text)
  if (every) {
    const unit = UNIT_SECONDS[(every[2] ?? "").toLowerCase()]
    return unit ? { expectedIntervalSeconds: Number(every[1]) * unit } : null
  }
  const at = /^at\s+(\d{1,2}):(\d{2})$/i.exec(text)
  if (at) {
    const [hour, minute] = [Number(at[1]), Number(at[2])]
    return hour < 24 && minute < 60 ? { scheduleCron: `${minute} ${hour} * * *` } : null
  }
  return text.split(/\s+/).length === 5 ? { scheduleCron: text } : null
}

/**
 * Cronitor monitors (`GET /api/monitors`). Jobs and heartbeats map to a dead-man's switch;
 * `check` and `site` monitors are active checks and are skipped. The schedule is `schedule`
 * or, in API version 2025-11-28 and later, the first entry of `schedules`.
 */
export function mapCronitor(monitors: unknown[]): ImportCandidate[] {
  return monitors.map((raw, i) => {
    if (!isRecord(raw)) return { source: `#${i + 1}`, skip: "not an object", warnings: [] }
    const name =
      (typeof raw.name === "string" && raw.name.trim()) ||
      (typeof raw.key === "string" && raw.key.trim()) ||
      ""
    const source = name || `#${i + 1}`
    const warnings: string[] = []
    if (raw.type !== "job" && raw.type !== "heartbeat") {
      return {
        source,
        skip: `type "${String(raw.type)}" is an active check; only jobs and heartbeats are imported`,
        warnings,
      }
    }
    if (!name) return { source, skip: "monitor has no name or key", warnings }

    let expr: string | undefined
    if (typeof raw.schedule === "string") expr = raw.schedule
    else if (Array.isArray(raw.schedules) && typeof raw.schedules[0] === "string") {
      expr = raw.schedules[0]
      if (raw.schedules.length > 1) warnings.push("only the first schedule was imported")
    }
    if (!expr) return { source, skip: "monitor has no schedule", warnings }
    const schedule = parseCronitorSchedule(expr)
    if (!schedule) return { source, skip: `unsupported schedule "${expr}"`, warnings }

    const input: Record<string, unknown> = { name, ...schedule }
    if ("scheduleCron" in schedule && typeof raw.timezone === "string" && raw.timezone) {
      input.timezone = raw.timezone
    }
    if (typeof raw.grace_seconds === "number") {
      if (raw.grace_seconds > MAX_GRACE) {
        warnings.push(`grace ${raw.grace_seconds}s reduced to ${MAX_GRACE}s`)
        input.gracePeriodSeconds = MAX_GRACE
      } else input.gracePeriodSeconds = raw.grace_seconds
    }
    if (Array.isArray(raw.tags)) {
      const tags = raw.tags.filter((t): t is string => typeof t === "string")
      if (tags.length) input.tags = tags
    }

    const dropped = ["assertions", "notify", "failure_tolerance", "schedule_tolerance"].filter(
      (k) =>
        raw[k] !== undefined &&
        raw[k] !== null &&
        raw[k] !== "" &&
        !(Array.isArray(raw[k]) && raw[k].length === 0),
    )
    if (dropped.length) warnings.push(`not imported: ${dropped.join(", ")}`)
    return { source, input, paused: raw.paused === true, warnings }
  })
}

/** Dead Man's Snitch intervals, from its API reference. A month is taken as 30 days. */
const DMS_INTERVAL_SECONDS: Record<string, number> = {
  "15_minute": 900,
  "30_minute": 1800,
  hourly: 3600,
  daily: 86_400,
  weekly: 604_800,
  monthly: 2_592_000,
}

/**
 * Dead Man's Snitch snitches (`GET /v1/snitches`): `name`, `interval`, `tags`, `status`
 * ("paused" marks a paused snitch). The API has no grace period, notes and e-mail
 * alerts have no equivalent here, and the check-in token is not reused.
 */
export function mapDeadMansSnitch(snitches: unknown[]): ImportCandidate[] {
  return snitches.map((raw, i) => {
    if (!isRecord(raw)) return { source: `#${i + 1}`, skip: "not an object", warnings: [] }
    const name = typeof raw.name === "string" ? raw.name.trim() : ""
    const source = name || `#${i + 1}`
    const warnings: string[] = []
    if (!name) return { source, skip: "snitch has no name", warnings }
    const interval =
      typeof raw.interval === "string" ? DMS_INTERVAL_SECONDS[raw.interval] : undefined
    if (!interval) return { source, skip: `unknown interval "${String(raw.interval)}"`, warnings }

    const tags = Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === "string")
      : []
    if (typeof raw.notes === "string" && raw.notes) warnings.push("notes are not imported")
    if (Array.isArray(raw.alert_email) && raw.alert_email.length) {
      warnings.push("alert e-mails are not imported; add notification channels in Cronko")
    }
    if (raw.interval === "monthly") warnings.push("monthly is imported as 30 days")
    warnings.push("the check-in token is not reused; the new ping URL is on the monitor page")
    return {
      source,
      input: {
        name,
        expectedIntervalSeconds: interval,
        gracePeriodSeconds: DEFAULT_GRACE_PERIOD_SECONDS,
        ...(tags.length && { tags }),
      },
      paused: raw.status === "paused",
      warnings,
    }
  })
}

/** Accepts a bare array or `{ monitors: [...] }`. */
export function extractList(doc: unknown, key: string): unknown[] | null {
  if (Array.isArray(doc)) return doc
  if (isRecord(doc) && Array.isArray(doc[key])) return doc[key]
  return null
}

/** Validates each candidate like POST /api/monitors and creates it unless `dryRun`. */
export async function runImport(
  candidates: ImportCandidate[],
  dryRun: boolean,
): Promise<ImportReport> {
  const report: ImportReport = { dryRun, created: [], skipped: [] }
  const seen = new Set<string>()

  for (const c of candidates) {
    const skip = (reason: string) =>
      report.skipped.push({ source: c.source, reason, warnings: c.warnings })
    if (c.skip || !c.input) {
      skip(c.skip ?? "nothing to import")
      continue
    }
    const parsed = createMonitorSchema.safeParse(c.input)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      skip(`invalid: ${issue?.path.join(".") || "monitor"} ${issue?.message ?? ""}`.trim())
      continue
    }
    const slug = slugFor(parsed.data.name)
    if (!slug) {
      skip("name has no letters or digits")
      continue
    }
    if (seen.has(slug) || (await findMonitorBySlug(slug))) {
      skip("a monitor with this name already exists")
      continue
    }
    seen.add(slug)

    if (dryRun) {
      report.created.push({ source: c.source, name: parsed.data.name, warnings: c.warnings })
      continue
    }
    const monitor = await insertMonitor(parsed.data)
    if (!monitor) {
      skip("a monitor with this name already exists")
      continue
    }
    if (c.paused) await pauseMonitor(monitor.id)
    report.created.push({
      source: c.source,
      name: monitor.name,
      id: monitor.id,
      warnings: c.warnings,
    })
  }
  return report
}
