import type { MonitorStatus } from "@cronko/shared/types"
import { formatDuration, formatRelativeTime } from "@cronko/shared/utils"
import { BellOff, Wrench } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "react-router"
import { isMuted } from "@/components/monitors/MuteControl"
import { TagChips } from "@/components/monitors/TagInput"
import { useMaintenance } from "@/components/monitors/useMaintenance"
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
const td = "px-3 py-4 align-middle"

/** The departures board: one row per monitor, worst first. */
export function DeparturesTable({
  rows,
  caption,
  actions,
  selection,
}: {
  rows: MonitorRow[]
  caption: string
  /** Optional trailing cell (e.g. a delete button). */
  actions?: (row: MonitorRow) => ReactNode
  /** Optional multi-select column (bulk actions). */
  selection?: {
    selected: ReadonlySet<string>
    onToggle: (id: string) => void
    onToggleAll: (ids: string[], select: boolean) => void
  }
}) {
  const { t, locale } = useT()
  const maintenanceUntil = useMaintenance()
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
    <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
      <table className="w-full min-w-[20rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line-strong bg-raised">
          <tr>
            {selection && (
              <th scope="col" className={`${th} w-10`}>
                <input
                  type="checkbox"
                  aria-label={t("bulk.selectAll")}
                  checked={rows.length > 0 && rows.every((r) => selection.selected.has(r.id))}
                  onChange={(e) =>
                    selection.onToggleAll(
                      rows.map((r) => r.id),
                      e.target.checked,
                    )
                  }
                  className="h-4 w-4 accent-[var(--signal)]"
                />
              </th>
            )}
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
                {selection && (
                  <td className={`${td} w-10`}>
                    <input
                      type="checkbox"
                      aria-label={t("bulk.select", { name: row.name })}
                      checked={selection.selected.has(row.id)}
                      onChange={() => selection.onToggle(row.id)}
                      className="h-4 w-4 accent-[var(--signal)]"
                    />
                  </td>
                )}
                <td className={`${td} hidden font-mono text-dim tnum md:table-cell`}>
                  {next(row)}
                </td>
                <th scope="row" className={`${td} text-left font-semibold`}>
                  <Link
                    to={`/monitors/${row.id}`}
                    className="text-base text-ink underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {row.name}
                  </Link>
                  {row.tags.length > 0 && (
                    <span className="ml-2">
                      <TagChips tags={row.tags} />
                    </span>
                  )}
                  {maintenanceUntil(row) && (
                    <span
                      title={t("maint.title")}
                      className="ml-2 inline-flex align-middle text-dim"
                    >
                      <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">{t("maint.title")}</span>
                    </span>
                  )}
                  {isMuted(row.mutedUntil) && (
                    <span
                      title={t("mute.muted")}
                      className="ml-2 inline-flex align-middle text-dim"
                    >
                      <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">{t("mute.muted")}</span>
                    </span>
                  )}
                  {/* Phones drop the NEXT/DURATION/EXIT columns; keep the data as a second line. */}
                  <span className="mt-0.5 block font-mono text-xs font-normal text-dim tnum md:hidden">
                    {[
                      next(row),
                      hb?.durationMs != null ? formatRunDuration(hb.durationMs) : null,
                      exit != null ? `${t("board.exit")} ${exit}` : null,
                    ]
                      .filter((v) => v && v !== "—")
                      .join(" · ")}
                  </span>
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
