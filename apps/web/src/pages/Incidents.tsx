import type { MonitorStatus } from "@cronko/shared/types"
import { formatDuration, formatRelativeTime } from "@cronko/shared/utils"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"
import { useEffect } from "react"
import { Link, useSearchParams } from "react-router"
import { Button } from "@/components/shared/Button"
import { EmptyState } from "@/components/shared/EmptyState"
import { SkeletonTable } from "@/components/shared/Skeleton"
import { Stamp } from "@/components/shared/Stamp"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-dim"
const td = "px-3 py-4 align-middle"

type Filter = "open" | "resolved" | undefined

export default function IncidentsPage() {
  const { t, locale } = useT()
  const { toast } = useToast()
  const [sp] = useSearchParams()
  const raw = sp.get("status")
  const status: Filter = raw === "open" || raw === "resolved" ? raw : undefined
  const limit = Math.min(Math.max(1, Number.parseInt(sp.get("limit") ?? "50", 10) || 50), 200)
  const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0)

  const {
    data: incidents = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["incidents", status, limit, offset],
    queryFn: () => api.incidents.list({ ...(status && { status }), limit, offset }),
  })
  const { data: monitors = [] } = useQuery({
    queryKey: ["monitors"],
    queryFn: () => api.monitors.list(),
  })
  // The summary must not depend on which page or tab is showing.
  const { data: openIncidents = [] } = useQuery({
    queryKey: ["incidents", "open", 200, 0],
    queryFn: () => api.incidents.list({ status: "open", limit: 200 }),
  })

  useEffect(() => {
    if (error) toast(t("incidents.failedLoad"), "error")
  }, [error, toast, t])

  const byId = new Map(monitors.map((m) => [m.id, m]))
  const now = Date.now()

  const page = (nextOffset: number) =>
    `/incidents?${new URLSearchParams({
      ...(status ? { status } : {}),
      limit: String(limit),
      offset: String(nextOffset),
    })}`

  const tabs: { label: string; to: string; active: boolean }[] = [
    { label: t("incidents.all"), to: "/incidents", active: !status },
    { label: t("incidents.open"), to: "/incidents?status=open", active: status === "open" },
    {
      label: t("incidents.resolved"),
      to: "/incidents?status=resolved",
      active: status === "resolved",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl leading-tight">{t("incidents.title")}</h1>
        <p
          className={`text-sm ${openIncidents.length ? "font-semibold text-down" : "text-dim"}`}
          aria-live="polite"
        >
          {t("incidents.openCount", { count: openIncidents.length })}
        </p>
      </div>

      <nav
        aria-label={t("incidents.title")}
        className="inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-line bg-raised p-1"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={tab.active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab.active ? "bg-panel text-ink shadow-sm" : "text-dim hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {isPending ? (
        <SkeletonTable rows={6} cols={5} />
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("incidents.noIncidents")}
          description={status === "open" ? t("incidents.allResolved") : t("incidents.noneYet")}
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
            <table className="w-full min-w-[20rem] border-collapse text-sm">
              <caption className="sr-only">{t("incidents.title")}</caption>
              <thead className="border-b border-line-strong bg-raised">
                <tr>
                  <th scope="col" className={th}>
                    {t("incidents.monitor")}
                  </th>
                  <th scope="col" className={`${th} hidden sm:table-cell`}>
                    {t("incidents.started")}
                  </th>
                  <th scope="col" className={`${th} hidden md:table-cell`}>
                    {t("incidents.colResolved")}
                  </th>
                  <th scope="col" className={th}>
                    {t("incidents.duration")}
                  </th>
                  <th scope="col" className={th}>
                    {t("incidents.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc) => {
                  const m = byId.get(inc.monitorId)
                  const started = new Date(inc.startedAt)
                  const resolved = inc.resolvedAt ? new Date(inc.resolvedAt) : null
                  const isOpen = inc.status === "open"
                  const ms = (resolved?.getTime() ?? now) - started.getTime()
                  return (
                    <tr
                      key={inc.id}
                      className={`border-b border-line transition-colors last:border-b-0 hover:bg-raised ${
                        isOpen ? "bg-[color-mix(in_oklch,var(--st-down)_9%,transparent)]" : ""
                      }`}
                    >
                      <th scope="row" className={`${td} text-left font-semibold`}>
                        <span className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/monitors/${inc.monitorId}`}
                            className="text-ink underline-offset-4 hover:underline focus-visible:underline"
                          >
                            {m?.name ?? inc.monitorId}
                          </Link>
                          {m && <StatusBadge status={m.status as MonitorStatus} />}
                        </span>
                      </th>
                      <td className={`${td} hidden text-dim sm:table-cell`}>
                        <time dateTime={inc.startedAt}>{formatRelativeTime(started, locale)}</time>
                      </td>
                      <td className={`${td} hidden text-dim md:table-cell`}>
                        {resolved ? formatRelativeTime(resolved, locale) : "—"}
                      </td>
                      <td className={`${td} font-mono tnum ${isOpen ? "text-ink" : "text-dim"}`}>
                        {isOpen
                          ? t("monitor.ongoingFor", { duration: formatDuration(ms) })
                          : formatDuration(ms)}
                      </td>
                      <td className={td}>
                        <Stamp
                          tone={isOpen ? "down" : "healthy"}
                          label={isOpen ? t("incidents.statusOpen") : t("incidents.statusResolved")}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            {offset === 0 ? (
              <Button variant="secondary" size="sm" disabled>
                {t("incidents.previous")}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" href={page(Math.max(0, offset - limit))}>
                {t("incidents.previous")}
              </Button>
            )}
            <span className="font-mono text-xs text-dim tnum">
              {offset + 1}–{offset + incidents.length}
            </span>
            {incidents.length < limit ? (
              <Button variant="secondary" size="sm" disabled>
                {t("incidents.next")}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" href={page(offset + limit)}>
                {t("incidents.next")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
