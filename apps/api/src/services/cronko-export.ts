import {
  createMaintenanceWindow,
  findAllMaintenanceWindows,
} from "@cronko/database/queries/maintenance"
import { findAllMonitors, findMonitorBySlug } from "@cronko/database/queries/monitors"
import {
  createNotificationChannel,
  findAllNotificationChannels,
} from "@cronko/database/queries/notifications"
import {
  createStatusPage,
  findAllStatusPages,
  findStatusPageBySlug,
} from "@cronko/database/queries/status-pages"
import { base as maintenanceSchema, problem, targetValue } from "../routes/maintenance"
import { slugFor } from "../routes/monitors"
import { createNotificationSchema } from "../routes/notifications"
import { statusPageSchema } from "../routes/status-pages"
import { type ImportCandidate, type ImportEntry, runImport } from "./importers"

/**
 * Cronko's own configuration export: monitors, channels, status pages and
 * maintenance windows, no history. Channel secrets (webhook URLs, bot tokens,
 * keys) are replaced by REDACTED unless asked for, and ping tokens are never
 * exported: an imported monitor always gets a fresh one.
 */

export const EXPORT_FORMAT = "cronko-export"
export const EXPORT_VERSION = 1
export const REDACTED = "[REDACTED]"

/** Config fields that carry a credential or a URL that works as one. */
const SECRET_FIELDS = new Set([
  "webhookUrl",
  "url",
  "botToken",
  "token",
  "appToken",
  "userKey",
  "routingKey",
])

type Config = Record<string, unknown>

export function redactConfig(config: Config): Config {
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => [
      k,
      SECRET_FIELDS.has(k) && typeof v === "string" && v !== "" ? REDACTED : v,
    ]),
  )
}

const hasRedacted = (config: Config) => Object.values(config).includes(REDACTED)

export async function buildExport(includeSecrets: boolean) {
  const [monitors, channels, pages, windows] = await Promise.all([
    findAllMonitors(),
    findAllNotificationChannels(),
    findAllStatusPages(),
    findAllMaintenanceWindows(),
  ])
  const slugById = new Map(monitors.map((m) => [m.id, m.slug]))

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    secretsIncluded: includeSecrets,
    monitors: monitors.map((m) => ({
      name: m.name,
      slug: m.slug,
      paused: m.paused,
      expectedIntervalSeconds: m.expectedIntervalSeconds,
      gracePeriodSeconds: m.gracePeriodSeconds,
      maxDurationMs: m.maxDurationMs,
      scheduleCron: m.scheduleCron,
      timezone: m.timezone,
      alertOnAnomalies: m.alertOnAnomalies,
      emailFailureKeywords: m.emailFailureKeywords,
      tags: m.tags,
    })),
    tags: [...new Set([...monitors.flatMap((m) => m.tags), ...pages.map((p) => p.tag)])].sort(),
    channels: channels.map((ch) => ({
      name: ch.name,
      type: ch.type,
      enabled: ch.enabled,
      config: includeSecrets ? ch.config : redactConfig(ch.config as Config),
    })),
    statusPages: pages.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      tag: p.tag,
      enabled: p.enabled,
    })),
    maintenanceWindows: windows.map((w) => ({
      name: w.name,
      schedule: w.schedule,
      timezone: w.timezone,
      durationMinutes: w.durationMinutes,
      target: w.target,
      // Monitor ids do not travel between instances; the slug does.
      targetValue:
        w.target === "monitor" ? (slugById.get(w.targetValue ?? "") ?? null) : w.targetValue,
      enabled: w.enabled,
    })),
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** Accepts the export itself or the same wrapped as `{ data: ... }`. */
export function extractExport(body: unknown): Record<string, unknown> | null {
  const doc = isRecord(body) && isRecord(body.data) ? body.data : body
  if (!isRecord(doc) || doc.format !== EXPORT_FORMAT) return null
  return doc
}

export function mapCronko(monitors: unknown[]): ImportCandidate[] {
  return monitors.map((raw, i) => {
    if (!isRecord(raw)) return { source: `#${i + 1}`, skip: "not an object", warnings: [] }
    const name = typeof raw.name === "string" ? raw.name.trim() : ""
    const input: Record<string, unknown> = { name }
    // Null means "not set" in the export; the create schema wants the key absent.
    for (const key of [
      "expectedIntervalSeconds",
      "gracePeriodSeconds",
      "maxDurationMs",
      "scheduleCron",
      "timezone",
      "alertOnAnomalies",
      "emailFailureKeywords",
      "tags",
    ]) {
      if (raw[key] !== null && raw[key] !== undefined) input[key] = raw[key]
    }
    // A cron monitor's interval is derived from the schedule.
    if (input.scheduleCron) delete input.expectedIntervalSeconds
    return {
      source: name || `#${i + 1}`,
      input,
      paused: raw.paused === true,
      warnings: ["ping URL is new; update it in your jobs"],
    }
  })
}

export type Section = { created: ImportEntry[]; skipped: ImportEntry[] }
export type CronkoImportReport = {
  dryRun: boolean
  created: ImportEntry[]
  skipped: ImportEntry[]
  channels: Section
  statusPages: Section
  maintenanceWindows: Section
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const issueText = (e: { issues: { path: PropertyKey[]; message: string }[] }) => {
  const i = e.issues[0]
  return `invalid: ${i?.path.join(".") || "entry"} ${i?.message ?? ""}`.trim()
}

export async function importCronko(
  doc: Record<string, unknown>,
  dryRun: boolean,
): Promise<CronkoImportReport> {
  const candidates = mapCronko(list(doc.monitors))
  const monitorReport = await runImport(candidates, dryRun)
  const report: CronkoImportReport = {
    ...monitorReport,
    channels: { created: [], skipped: [] },
    statusPages: { created: [], skipped: [] },
    maintenanceWindows: { created: [], skipped: [] },
  }

  // Channels: same type and name = already there.
  const existingChannels = await findAllNotificationChannels()
  const channelKeys = new Set(existingChannels.map((c) => `${c.type}\u0000${c.name}`))
  for (const [i, raw] of list(doc.channels).entries()) {
    const source = isRecord(raw) && typeof raw.name === "string" ? raw.name : `#${i + 1}`
    const skip = (reason: string) => report.channels.skipped.push({ source, reason, warnings: [] })
    if (isRecord(raw) && isRecord(raw.config) && hasRedacted(raw.config)) {
      skip("secrets were redacted in the export; add this channel by hand")
      continue
    }
    const parsed = createNotificationSchema.safeParse(raw)
    if (!parsed.success) {
      skip(issueText(parsed.error))
      continue
    }
    const key = `${parsed.data.type}\u0000${parsed.data.name}`
    if (channelKeys.has(key)) {
      skip("a channel with this type and name already exists")
      continue
    }
    channelKeys.add(key)
    if (!dryRun) {
      await createNotificationChannel({
        id: crypto.randomUUID(),
        name: parsed.data.name,
        type: parsed.data.type,
        enabled: isRecord(raw) && typeof raw.enabled === "boolean" ? raw.enabled : true,
        config: parsed.data.config,
      })
    }
    report.channels.created.push({ source, name: parsed.data.name, warnings: [] })
  }

  // Status pages: slug is unique.
  const pageSlugs = new Set<string>()
  for (const [i, raw] of list(doc.statusPages).entries()) {
    const source = isRecord(raw) && typeof raw.slug === "string" ? raw.slug : `#${i + 1}`
    const skip = (reason: string) =>
      report.statusPages.skipped.push({ source, reason, warnings: [] })
    const parsed = statusPageSchema.safeParse(
      isRecord(raw) ? { ...raw, description: raw.description ?? undefined } : raw,
    )
    if (!parsed.success) {
      skip(issueText(parsed.error))
      continue
    }
    if (pageSlugs.has(parsed.data.slug) || (await findStatusPageBySlug(parsed.data.slug))) {
      skip("a status page with this slug already exists")
      continue
    }
    pageSlugs.add(parsed.data.slug)
    if (!dryRun) {
      await createStatusPage({
        id: crypto.randomUUID(),
        slug: parsed.data.slug,
        title: parsed.data.title,
        description: parsed.data.description || null,
        tag: parsed.data.tag,
        ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
        now: new Date(),
      })
    }
    report.statusPages.created.push({ source, name: parsed.data.title, warnings: [] })
  }

  // Maintenance windows: name is the identity. Monitor targets travel as slugs.
  const plannedSlugs = new Set(
    candidates
      .filter((c) => c.input && !report.skipped.some((s) => s.source === c.source))
      .map((c) => slugFor(String(c.input?.name ?? ""))),
  )
  const existingWindows = new Set((await findAllMaintenanceWindows()).map((w) => w.name))
  for (const [i, raw] of list(doc.maintenanceWindows).entries()) {
    const source = isRecord(raw) && typeof raw.name === "string" ? raw.name : `#${i + 1}`
    const skip = (reason: string) =>
      report.maintenanceWindows.skipped.push({ source, reason, warnings: [] })
    const parsed = maintenanceSchema.safeParse(raw)
    if (!parsed.success) {
      skip(issueText(parsed.error))
      continue
    }
    const body = { ...parsed.data }
    let pendingMonitor = false
    if (body.target === "monitor") {
      const existing = await findMonitorBySlug(body.targetValue ?? "")
      if (existing) body.targetValue = existing.id
      else if (dryRun && plannedSlugs.has(body.targetValue ?? "")) pendingMonitor = true
      else {
        skip("the targeted monitor does not exist")
        continue
      }
    }
    const error = await problem(pendingMonitor ? { ...body, target: "all" } : body)
    if (error) {
      skip(`invalid: ${error}`)
      continue
    }
    if (existingWindows.has(body.name)) {
      skip("a maintenance window with this name already exists")
      continue
    }
    existingWindows.add(body.name)
    if (!dryRun) {
      await createMaintenanceWindow({
        id: crypto.randomUUID(),
        name: body.name,
        schedule: body.schedule,
        timezone: body.timezone,
        durationMinutes: body.durationMinutes,
        target: body.target,
        targetValue: targetValue(body),
        enabled: body.enabled ?? true,
        now: new Date(),
      })
    }
    report.maintenanceWindows.created.push({ source, name: body.name, warnings: [] })
  }

  return report
}
