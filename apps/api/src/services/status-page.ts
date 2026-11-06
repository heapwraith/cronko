import { findIncidentsOverlapping } from "@cronko/database/queries/incidents"
import { findAllMonitors } from "@cronko/database/queries/monitors"
import type { StatusPage } from "@cronko/database/queries/status-pages"
import {
  type DayUptime,
  dailyUptime,
  overallState,
  overallUptime,
  type PublicState,
  publicState,
  STATUS_DAYS,
  STATUS_INCIDENT_DAYS,
} from "@cronko/shared/status"

const DAY_MS = 86_400_000

/**
 * Everything a public status page shows. Built field by field on purpose: tokens,
 * ping URLs, ids, job output, IPs, exit codes and schedules never leave the server.
 */
export interface PublicStatus {
  title: string
  description: string | null
  state: PublicState
  generatedAt: string
  monitors: { name: string; state: PublicState; uptime: number | null; days: DayUptime[] }[]
  incidents: { monitor: string; startedAt: string; resolvedAt: string | null }[]
}

export async function buildPublicStatus(page: StatusPage, now = new Date()): Promise<PublicStatus> {
  const monitors = (await findAllMonitors()).filter((m) => m.tags.includes(page.tag))
  const since = new Date(now.getTime() - STATUS_DAYS * DAY_MS)
  const incidents = await findIncidentsOverlapping(
    monitors.map((m) => m.id),
    since,
  )
  const nameById = new Map(monitors.map((m) => [m.id, m.name]))

  const rows = monitors.map((m) => {
    const days = dailyUptime({
      incidents: incidents.filter((i) => i.monitorId === m.id),
      createdAt: m.createdAt,
      now,
    })
    return { name: m.name, state: publicState(m.status), uptime: overallUptime(days), days }
  })

  const recentSince = now.getTime() - STATUS_INCIDENT_DAYS * DAY_MS
  const recent = incidents
    .filter((i) => !i.resolvedAt || i.resolvedAt.getTime() >= recentSince)
    .map((i) => ({
      monitor: nameById.get(i.monitorId) ?? "",
      startedAt: i.startedAt.toISOString(),
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
    }))

  return {
    title: page.title,
    description: page.description,
    state: overallState(rows.map((r) => r.state)),
    generatedAt: now.toISOString(),
    monitors: rows,
    incidents: recent,
  }
}
