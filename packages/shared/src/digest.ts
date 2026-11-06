/**
 * Daily / weekly digest: when it is due, and the text sent to every channel.
 *
 * The digest goes out at a fixed hour in the instance timezone (weekly: Mondays).
 * The scheduler asks `digestDue` on every tick; the last send is stored, so a
 * restart neither repeats nor skips one.
 */
import { nextRun } from "./schedule"

export type DigestFrequency = "off" | "daily" | "weekly"
export const DIGEST_FREQUENCIES: readonly DigestFrequency[] = ["off", "daily", "weekly"]

const DAY_MS = 86_400_000

export function digestSchedule(frequency: DigestFrequency, hour: number): string | null {
  if (frequency === "off") return null
  return frequency === "daily" ? `0 ${hour} * * *` : `0 ${hour} * * 1`
}

export function digestPeriodMs(frequency: Exclude<DigestFrequency, "off">): number {
  return frequency === "daily" ? DAY_MS : 7 * DAY_MS
}

/** The latest scheduled send at or before `now`, looking back one period. */
export function lastDigestSlot(
  frequency: DigestFrequency,
  hour: number,
  timezone: string,
  now: Date,
): Date | null {
  const schedule = digestSchedule(frequency, hour)
  if (!schedule || frequency === "off") return null
  let cursor = new Date(now.getTime() - digestPeriodMs(frequency) - 1000)
  let slot: Date | null = null
  for (let i = 0; i < 10; i++) {
    const next = nextRun(schedule, timezone, cursor)
    if (!next || next.getTime() > now.getTime()) break
    slot = next
    cursor = next
  }
  return slot
}

/** The slot to send now, or null when the latest slot was already sent (or is off). */
export function digestDue(input: {
  frequency: DigestFrequency
  hour: number
  timezone: string
  now: Date
  lastSentAt: Date | null
}): Date | null {
  const slot = lastDigestSlot(input.frequency, input.hour, input.timezone, input.now)
  if (!slot) return null
  if (input.lastSentAt && input.lastSentAt.getTime() >= slot.getTime()) return null
  return slot
}

export interface DigestMonitor {
  id: string
  name: string
  status: string
  paused: boolean
  expectedIntervalSeconds: number
}

export interface DigestIncident {
  monitorId: string
  startedAt: Date
  resolvedAt: Date | null
}

export interface DigestRun {
  monitorId: string
  exitCode: number | null
  kind: "start" | "finish" | null
}

export interface DigestInput {
  frequency: Exclude<DigestFrequency, "off">
  from: Date
  to: Date
  timezone: string
  instanceName: string
  monitors: readonly DigestMonitor[]
  incidents: readonly DigestIncident[]
  runs: readonly DigestRun[]
  link?: string | undefined
}

/** Names listed per line before "+N"; keeps chat messages under their size limits. */
const MAX_NAMES = 5
const PROBLEM = new Set(["down", "failed", "missed"])

function countBy<T>(items: readonly T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

function truncated(items: readonly string[]): string {
  const more = items.length - MAX_NAMES
  return items.slice(0, MAX_NAMES).join(", ") + (more > 0 ? ` +${more}` : "")
}

function nameList(entries: readonly [string, number][]): string {
  return truncated(entries.map(([n, c]) => `${n} (${c})`))
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "há 3 h" style age, coarse on purpose. */
function since(from: Date, to: Date): string {
  const min = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} dias`
}

function formatDay(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, day: "numeric", month: "short" })
    .format(d)
    .replace(/\./g, "")
}

/** Plain text, one fact per line, so it reads the same in chat apps and e-mail. */
export function buildDigest(input: DigestInput): string {
  const { monitors, from, to, timezone } = input
  const byId = new Map(monitors.map((m) => [m.id, m]))
  const nameOf = (id: string) => byId.get(id)?.name ?? "?"
  const kind = input.frequency === "daily" ? "diário" : "semanal"
  const lines: string[] = []

  const period =
    input.frequency === "daily"
      ? formatDay(from, timezone)
      : `${formatDay(from, timezone)} a ${formatDay(new Date(to.getTime() - 1), timezone)}`
  lines.push(`📊 Resumo ${kind} — ${input.instanceName} (${period})`)

  // Current state.
  const paused = monitors.filter((m) => m.paused || m.status === "paused")
  const active = monitors.filter((m) => !paused.includes(m))
  const problems = active.filter((m) => PROBLEM.has(m.status))
  const parts = [`${active.length - problems.length} ok`]
  if (problems.length) parts.push(`${problems.length} com problema`)
  if (paused.length) parts.push(`${plural(paused.length, "pausado", "pausados")}`)
  lines.push(`Agora: ${plural(monitors.length, "monitor", "monitores")} — ${parts.join(", ")}`)

  if (problems.length) {
    const open = new Map<string, Date>()
    for (const i of input.incidents) {
      if (i.resolvedAt) continue
      const prev = open.get(i.monitorId)
      if (!prev || i.startedAt < prev) open.set(i.monitorId, i.startedAt)
    }
    const shown = problems.map((m) => {
      const start = open.get(m.id)
      return start ? `${m.name} (${m.status} há ${since(start, to)})` : `${m.name} (${m.status})`
    })
    lines.push(`Precisam de atenção: ${truncated(shown)}`)
  }

  // The period.
  lines.push("")
  const finished = input.runs.filter((r) => r.kind !== "start")
  const failed = finished.filter((r) => r.exitCode !== null && r.exitCode !== 0)
  lines.push(
    `• ${plural(finished.length, "execução", "execuções")}` +
      (failed.length ? `, ${failed.length} com falha` : ", nenhuma falha"),
  )
  if (failed.length) {
    lines.push(`  Falhas: ${nameList(countBy(failed, (r) => nameOf(r.monitorId)))}`)
  }

  const opened = input.incidents.filter((i) => i.startedAt >= from && i.startedAt < to)
  if (opened.length) {
    const per = countBy(opened, (i) => nameOf(i.monitorId))
    lines.push(
      `• ${plural(opened.length, "incidente", "incidentes")} em ${plural(per.length, "monitor", "monitores")}: ${nameList(per)}`,
    )
  } else {
    lines.push("• Nenhum incidente novo ✅")
  }

  // Only jobs expected to run inside the period; a weekly job is not "silent" for a day.
  const periodMs = to.getTime() - from.getTime()
  const ran = new Set(input.runs.map((r) => r.monitorId))
  const silent = active.filter(
    (m) => m.status !== "pending" && m.expectedIntervalSeconds * 1000 <= periodMs && !ran.has(m.id),
  )
  if (silent.length) lines.push(`• Sem nenhum ping: ${truncated(silent.map((m) => m.name))}`)

  if (input.link) lines.push("", input.link)
  return lines.join("\n")
}
