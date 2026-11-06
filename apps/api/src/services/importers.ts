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
