import type { MonitorStatus } from "@cronko/shared/types"
import { formatDuration, formatRelativeTime } from "@cronko/shared/utils"
import { AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { statusKey } from "@/lib/status"

export default function IncidentsPage() {
  const { t } = useT()
  const [sp] = useSearchParams()
  const status = sp.get("status") as "open" | "resolved" | null
  const limit = Math.min(Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50), 200)
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0)

  const [incidents, setIncidents] = useState<
    Array<{
      id: string
      monitorId: string
      status: string
      startedAt: string
      resolvedAt: string | null
    }>
  >([])
  const [monitors, setMonitors] = useState<Array<{ id: string; name: string; status: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const statusParam = status ?? undefined
    Promise.all([
      api.incidents.list({
        ...(statusParam !== undefined && { status: statusParam }),
        limit,
        offset,
      }),
      api.monitors.list(),
    ])
      .then(([inc, mon]) => {
        setIncidents(inc)
        setMonitors(mon.map((m) => ({ id: m.id, name: m.name, status: m.status })))
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error("Failed to load incidents:", e)
      })
      .finally(() => setLoading(false))
  }, [status, limit, offset])

  const monitorMeta = (monitorId: string) => {
    const m = monitors.find((mon) => mon.id === monitorId)
    return { name: m?.name ?? monitorId, status: m?.status ?? "unknown" }
  }

  const openCount = incidents.filter((i) => i.status === "open").length
  const resolvedCount = incidents.filter((i) => i.status === "resolved").length

  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
      active
        ? "bg-[#edece7] dark:bg-zinc-800 text-[#1a1f36] dark:text-zinc-100"
        : "text-[#697386] dark:text-zinc-400 hover:text-[#1a1f36] dark:hover:text-zinc-200 hover:bg-[#f4f2ee] dark:hover:bg-zinc-800/50"
    }`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#1a1f36] dark:text-zinc-100">
          {t("incidents.title")}
        </h1>
      </div>

      <div className="flex items-center gap-4 text-xs text-[#697386] dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="font-medium text-[#1a1f36] dark:text-zinc-100">{openCount}</span>{" "}
          {t("incidents.openCount", { count: openCount })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-[#1a1f36] dark:text-zinc-100">{resolvedCount}</span>{" "}
          {t("incidents.resolvedCount", { count: resolvedCount })}
        </span>
      </div>

      <div className="flex gap-2">
        <Link to="/incidents" className={tabClass(!status)}>
          {t("incidents.all")}
          <span className="text-[10px] text-[#8e99a8]">{incidents.length}</span>
        </Link>
        <Link to="/incidents?status=open" className={tabClass(status === "open")}>
          {t("incidents.open")}
          <span className="text-[10px] text-[#8e99a8]">{openCount}</span>
        </Link>
        <Link to="/incidents?status=resolved" className={tabClass(status === "resolved")}>
          {t("incidents.resolved")}
          <span className="text-[10px] text-[#8e99a8]">{resolvedCount}</span>
        </Link>
      </div>

      <div className="rounded-xl border border-[#e8eaed] dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm transition-colors">
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-[#697386] dark:text-zinc-500">
            {t("common.loading")}
          </div>
        ) : incidents.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title={t("incidents.noIncidents")}
            description={status === "open" ? t("incidents.allResolved") : t("incidents.noneYet")}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8eaed] dark:border-zinc-800/80 text-left">
                    <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                      {t("incidents.monitor")}
                    </th>
                    <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                      {t("incidents.started")}
                    </th>
                    <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                      {t("incidents.colResolved")}
                    </th>
                    <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                      {t("incidents.duration")}
                    </th>
                    <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                      {t("incidents.status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((inc) => {
                    const m = monitorMeta(inc.monitorId)
                    const started = new Date(inc.startedAt)
                    const resolved = inc.resolvedAt ? new Date(inc.resolvedAt) : null
                    const isOpen = inc.status === "open"
                    const durationMs = resolved
                      ? resolved.getTime() - started.getTime()
                      : Date.now() - started.getTime()
                    return (
                      <tr
                        key={inc.id}
                        className={`border-b border-[#e8eaed] dark:border-zinc-800/50 transition-colors ${
                          isOpen
                            ? "border-l-2 border-l-amber-400 bg-amber-50/20 dark:bg-amber-950/10"
                            : "hover:bg-[#f6f8fa] dark:hover:bg-zinc-800/30"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/monitors/${inc.monitorId}`}
                              className="text-sm text-[#1a1f36] dark:text-zinc-100 hover:text-[#5e6ad2] dark:hover:text-emerald-400 transition-colors"
                            >
                              {m.name}
                            </Link>
                            <StatusBadge
                              status={m.status as MonitorStatus}
                              label={t(statusKey(m.status))}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#697386] dark:text-zinc-400">
                          {formatRelativeTime(started)}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#697386] dark:text-zinc-400">
                          {resolved ? formatRelativeTime(resolved) : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#1a1f36] dark:text-zinc-100 tabular-nums">
                          {isOpen ? (
                            <span className="text-amber-600 dark:text-amber-400">
                              {t("monitor.ongoingFor", { duration: formatDuration(durationMs) })}
                            </span>
                          ) : (
                            <span className="text-[#697386] dark:text-zinc-400">
                              {formatDuration(durationMs)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              isOpen
                                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {inc.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[#e8eaed] dark:border-zinc-800/80 px-4 py-2.5 flex items-center justify-between">
              <Link
                to={`/incidents?${new URLSearchParams({ ...(status ? { status } : {}), limit: String(limit), offset: String(Math.max(0, offset - limit)) }).toString()}`}
                className={`rounded-lg border border-[#e8eaed] dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-[#697386] dark:text-zinc-400 hover:bg-[#f6f8fa] dark:hover:bg-zinc-800 transition-colors ${
                  offset === 0 ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                {t("incidents.previous")}
              </Link>
              <span className="text-xs text-[#697386] dark:text-zinc-500">
                {incidents.length > 0 ? `${offset + 1}–${offset + incidents.length}` : "—"}
              </span>
              <Link
                to={`/incidents?${new URLSearchParams({ ...(status ? { status } : {}), limit: String(limit), offset: String(offset + limit) }).toString()}`}
                className={`rounded-lg border border-[#e8eaed] dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-[#697386] dark:text-zinc-400 hover:bg-[#f6f8fa] dark:hover:bg-zinc-800 transition-colors ${
                  incidents.length < limit ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                {t("incidents.next")}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
