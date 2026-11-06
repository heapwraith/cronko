import type { MonitorStatus } from "@cronko/shared/types"
import { formatRelativeTime } from "@cronko/shared/utils"
import { useQuery } from "@tanstack/react-query"
import { Activity, Plus, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { DeleteMonitorButton } from "@/components/monitors/DeleteMonitorButton"
import { EmptyState } from "@/components/shared/EmptyState"
import { SkeletonTable } from "@/components/shared/Skeleton"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { statusKey } from "@/lib/status"

type MonitorRow = {
  id: string
  name: string
  status: string
  slug: string
  expectedIntervalSeconds: number
  paused: boolean
  latestHeartbeat: { receivedAt: string; durationMs: number | null } | null
}

export default function MonitorsPage() {
  const { t } = useT()
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const {
    data: monitors = [],
    isPending: isLoading,
    error,
  } = useQuery({
    queryKey: ["monitors"],
    queryFn: () => api.monitors.list() as Promise<MonitorRow[]>,
  })

  useEffect(() => {
    if (error) toast(t("monitors.failedLoad"), "error")
  }, [error, toast, t])

  const filtered = monitors.filter((m: MonitorRow) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading)
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold text-[#1a1f36] dark:text-zinc-100">
          {t("monitors.title")}
        </h1>
        <SkeletonTable rows={5} cols={5} />
      </div>
    )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-[#1a1f36] dark:text-zinc-100">
          {t("monitors.title")}
        </h1>
        <Link
          to="/monitors/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          {t("monitors.newMonitor")}
        </Link>
      </div>

      {monitors.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8e99a8] dark:text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("monitors.searchMonitors")}
            className="w-full rounded-lg border border-[#dde0e4] dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-4 py-2.5 text-sm text-[#1a1f36] dark:text-zinc-100 placeholder:text-[#8e99a8] dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/40 focus:border-[#5e6ad2]/40 transition-colors shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none"
          />
        </div>
      )}

      {monitors.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={t("monitors.noMonitors")}
          description={t("monitors.noMonitorsDesc")}
          action={{ label: t("monitors.create"), href: "/monitors/new" }}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#e8eaed] dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm p-8 text-center transition-colors">
          <p className="text-sm text-[#697386] dark:text-zinc-500">
            {t("monitors.noMatch", { search })}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#e8eaed] dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8eaed] dark:border-zinc-800/80 text-left">
                  <th className="px-5 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("monitors.name")}
                  </th>
                  <th className="px-5 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("dashboard.status")}
                  </th>
                  <th className="px-5 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("monitors.interval")}
                  </th>
                  <th className="px-5 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("monitors.lastPing")}
                  </th>
                  <th className="px-5 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("monitors.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m: MonitorRow) => (
                  <tr
                    key={m.id}
                    className={`border-b border-[#e8eaed] dark:border-zinc-800/50 hover:bg-[#f6f8fa] dark:hover:bg-zinc-800/30 transition-colors ${m.paused ? "opacity-50" : ""}`}
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/monitors/${m.id}`}
                        className="text-sm text-[#1a1f36] dark:text-zinc-100 hover:text-[#5e6ad2] dark:hover:text-emerald-400 transition-colors"
                      >
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge
                        status={m.status as MonitorStatus}
                        label={t(statusKey(m.status))}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#697386] dark:text-zinc-400">
                      {m.paused ? (
                        <span className="text-[#8e99a8] dark:text-zinc-600">
                          {t("monitors.paused")}
                        </span>
                      ) : (
                        `${m.expectedIntervalSeconds}s`
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#697386] dark:text-zinc-400">
                      {m.latestHeartbeat
                        ? formatRelativeTime(new Date(m.latestHeartbeat.receivedAt))
                        : t("common.never")}
                    </td>
                    <td className="px-5 py-3.5">
                      <DeleteMonitorButton monitorId={m.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
