import type { MonitorStatus } from "@cronko/shared/types"
import { formatDuration, formatRelativeTime } from "@cronko/shared/utils"
import type { ReactNode } from "react"
import { Link } from "react-router"
import { StatusBadge } from "@/components/shared/StatusBadge"
import type { api } from "@/lib/api"
import { formatInterval, formatRunDuration, severityRank } from "@/lib/format"
import { useT } from "@/lib/i18n"

export type MonitorRow = Awaited<ReturnType<typeof api.monitors.list>>[number]

export function sortBySeverity(rows: MonitorRow[]): MonitorRow[] {
  return [...rows].sort(
    (a, b) => severityRank(a.status) - severityRank(b.status) || a.name.localeCompare(b.name),
  )
}

const TINT: Partial<Record<string, string>> = {
  failed: "bg-[color-mix(in_oklch,var(--st-failed)_9%,transparent)]",
  down: "bg-[color-mix(in_oklch,var(--st-down)_9%,transparent)]",
  missed: "bg-[color-mix(in_oklch,var(--st-missed)_8%,transparent)]",
}

const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-dim"
const td = "px-3 py-3 align-middle"

/** The departures board: one row per monitor, worst first. */
export function DeparturesTable({
  rows,
  caption,
  actions,
}: {
  rows: MonitorRow[]
  caption: string
  /** Optional trailing cell (e.g. a delete button). */
  actions?: (row: MonitorRow) => ReactNode
}) {
  const { t, locale } = useT()
  const now = Date.now()

  const next = (row: MonitorRow): string => {
    if (row.paused) return "—"
    // The server computes it (cron monitors follow their schedule, not the last ping).
    const dueIso = row.nextExpectedAt
    if (!dueIso) return "—"
    const due = new Date(dueIso).getTime()
    return due >= now
      ? t("board.in", { time: formatDuration(due - now) })
      : t("board.overdue", { time: formatDuration(now - due) })
  }

  return (
    <div className="overflow-x-auto rounded-[6px] border border-line bg-panel">
      <table className="w-full min-w-[20rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b-2 border-line-strong">
          <tr>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              {t("board.next")}
            </th>
            <th scope="col" className={th}>
              {t("board.job")}
            </th>
            <th scope="col" className={`${th} hidden lg:table-cell`}>
              {t("board.interval")}
            </th>
            <th scope="col" className={`${th} hidden sm:table-cell`}>
              {t("board.lastPing")}
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              {t("board.duration")}
            </th>
            <th scope="col" className={`${th} hidden lg:table-cell`}>
              {t("board.exit")}
            </th>
            <th scope="col" className={th}>
              {t("board.state")}
            </th>
            {actions && (
              <th scope="col" className={th}>
                <span className="sr-only">{t("board.actions")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hb = row.latestHeartbeat
            const exit = hb?.exitCode
            return (
              <tr
                key={row.id}
                className={`border-b border-line last:border-b-0 transition-colors hover:bg-raised ${TINT[row.status] ?? ""}`}
              >
                <td className={`${td} hidden font-mono text-dim tnum md:table-cell`}>
                  {next(row)}
                </td>
                <th scope="row" className={`${td} text-left font-semibold`}>
                  <Link
                    to={`/monitors/${row.id}`}
                    className="text-ink underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {row.name}
                  </Link>
                </th>
                <td className={`${td} hidden font-mono text-dim tnum lg:table-cell`}>
                  {formatInterval(row.expectedIntervalSeconds)}
                </td>
                <td className={`${td} hidden text-dim sm:table-cell`}>
                  {hb ? formatRelativeTime(new Date(hb.receivedAt), locale) : "—"}
                </td>
                <td className={`${td} hidden font-mono text-dim tnum md:table-cell`}>
                  {formatRunDuration(hb?.durationMs)}
                </td>
                <td
                  className={`${td} hidden font-mono tnum lg:table-cell ${
                    exit != null && exit !== 0 ? "font-semibold text-failed" : "text-dim"
                  }`}
                >
                  {exit ?? "—"}
                </td>
                <td className={td}>
                  <StatusBadge status={row.status as MonitorStatus} />
                </td>
                {actions && <td className={`${td} text-right`}>{actions(row)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
