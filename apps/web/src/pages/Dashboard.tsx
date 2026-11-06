import type { MonitorStatus } from "@cronko/shared/types"
import { formatRelativeTime } from "@cronko/shared/utils"
import { useQuery } from "@tanstack/react-query"
import { BarChart3, Plus } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { DeparturesTable, sortBySeverity } from "@/components/monitors/DeparturesTable"
import { Button } from "@/components/shared/Button"
import { EmptyState } from "@/components/shared/EmptyState"
import { SkeletonTable } from "@/components/shared/Skeleton"
import { api } from "@/lib/api"
import { ATTENTION } from "@/lib/format"
import { useT } from "@/lib/i18n"
import { statusKey } from "@/lib/status"

const POLL_INTERVAL_MS = 30_000
const FILTERS: MonitorStatus[] = ["failed", "down", "missed", "pending", "healthy", "paused"]

export default function DashboardPage() {
  const { t, locale } = useT()
  const [filter, setFilter] = useState<MonitorStatus | "all">("all")

  const { data, isPending } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [stats, monitors, incidents, deliveries] = await Promise.all([
        api.stats.get(),
        api.monitors.list(),
        api.incidents.list({ status: "open", limit: 10 }),
        api.notifications.deliveries(50),
      ])
      return { stats, monitors, incidents, deliveries }
    },
    refetchInterval: POLL_INTERVAL_MS,
  })

  const monitors = data?.monitors ?? []
  const counts = new Map<string, number>()
  for (const m of monitors) counts.set(m.status, (counts.get(m.status) ?? 0) + 1)
  const attention = monitors.filter((m) => ATTENTION.has(m.status)).length
  const rows = sortBySeverity(monitors).filter((m) => filter === "all" || m.status === filter)
  const names = new Map(monitors.map((m) => [m.id, m.name]))
  const undelivered = (data?.deliveries ?? []).filter((d) => d.status !== "sent")

  const summary =
    attention === 0
      ? t("board.allClear")
      : attention === 1
        ? t("board.attentionOne")
        : t("board.attention", { n: attention })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{t("dashboard.title")}</h1>
          {!isPending && monitors.length > 0 && (
            <p className="mt-1 text-sm text-dim" aria-live="polite">
              <span className={attention > 0 ? "font-semibold text-ink" : ""}>{summary}</span>
              {data?.stats && data.stats.totalHeartbeats > 0 && (
                <>
                  {" "}
                  ·{" "}
                  {t("board.onTime", {
                    pct: data.stats.uptimePercent.toLocaleString(locale, {
                      maximumFractionDigits: 1,
                    }),
                  })}
                </>
              )}
            </p>
          )}
        </div>
        <Button href="/monitors/new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("dashboard.createMonitor")}
        </Button>
      </div>

      {isPending ? (
        <SkeletonTable rows={6} cols={5} />
      ) : monitors.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={t("dashboard.noMonitors")}
          description={t("dashboard.noMonitorsDesc")}
          action={{ label: t("dashboard.createMonitor"), href: "/monitors/new" }}
        />
      ) : (
        <>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">{t("board.filterBy")}</legend>
            {(["all", ...FILTERS] as const)
              .filter((f) => f === "all" || (counts.get(f) ?? 0) > 0)
              .map((f) => {
                const active = filter === f
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f)}
                    className={`rounded-[4px] border px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "border-ink bg-ink text-ground"
                        : "border-line-strong bg-panel text-dim hover:text-ink"
                    }`}
                  >
                    {f === "all" ? t("board.all") : t(statusKey(f))}
                    <span className="ml-2 font-mono tnum opacity-80">
                      {f === "all" ? monitors.length : (counts.get(f) ?? 0)}
                    </span>
                  </button>
                )
              })}
          </fieldset>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-dim">{t("board.noResults")}</p>
          ) : (
            <DeparturesTable rows={rows} caption={t("board.caption")} />
          )}

          {(data?.incidents.length ?? 0) > 0 && (
            <section aria-labelledby="open-incidents" className="space-y-2">
              <h2 id="open-incidents" className="text-sm font-semibold text-ink">
                {t("board.openIncidents")}
              </h2>
              <ul className="divide-y divide-line rounded-[6px] border border-line bg-panel">
                {data?.incidents.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
                  >
                    <Link to={`/monitors/${i.monitorId}`} className="font-semibold hover:underline">
                      {names.get(i.monitorId) ?? i.monitorId}
                    </Link>
                    <span className="text-dim">
                      {t("board.since", {
                        time: formatRelativeTime(new Date(i.startedAt), locale),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {undelivered.length > 0 && (
            <section aria-labelledby="undelivered" className="space-y-2">
              <h2 id="undelivered" className="text-sm font-semibold text-ink">
                {t("board.undelivered")}
              </h2>
              <ul className="divide-y divide-line rounded-[6px] border border-line bg-panel">
                {undelivered.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                  >
                    <span>
                      <span className="font-semibold">{d.monitorName}</span>{" "}
                      <span className="text-dim">→ {d.channelName}</span>
                    </span>
                    <span className="font-mono text-xs text-down tnum">
                      {d.lastError ?? "—"} · {t("board.attempts", { n: d.attempts })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
