import { formatRelativeTime } from "@cronko/shared/utils"
import { useQuery } from "@tanstack/react-query"
import { Activity, AlertTriangle, BarChart3, Heart, TrendingUp } from "lucide-react"
import { Link } from "react-router"
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter"
import { DonutChart } from "@/components/dashboard/DonutChart"
import { Sparkline } from "@/components/dashboard/Sparkline"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card"
import { EmptyState } from "@/components/shared/EmptyState"
import { SkeletonCard } from "@/components/shared/Skeleton"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

type DashboardStats = {
  healthyCount: number
  downCount: number
  missedCount: number
  pausedCount: number
  totalHeartbeats: number
  uptimePercent: number
  heartbeatsByHour: number[]
} | null

type MonitorRow = {
  id: string
  name: string
  status: string
  expectedIntervalSeconds: number
  latestHeartbeat: { receivedAt: string; durationMs: number | null } | null
}

const POLL_INTERVAL_MS = 30_000 // 30 seconds

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bgClass,
  suffix,
  sparkData,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgClass: string
  suffix?: string
  sparkData?: number[]
}) {
  return (
    <Card glass className="p-4 hover:scale-[1.005] transition-transform">
      <div className="flex items-center gap-2">
        <div className={`rounded-lg p-2 ${bgClass}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <span className="text-xs text-[#697386] dark:text-zinc-500">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-[#1a1f36] dark:text-zinc-100 tabular-nums">
          <AnimatedCounter value={value} duration={800} />
        </span>
        {suffix && <span className="text-sm text-[#697386] dark:text-zinc-500">{suffix}</span>}
      </div>
      {sparkData && sparkData.length >= 2 ? (
        <div className="mt-2 h-8">
          <Sparkline
            data={sparkData}
            color={color
              .replace("text-", "rgb(")
              .replace("emerald-400", "52 211 153")
              .replace("red-400", "248 113 113")
              .replace("amber-400", "251 191 36")
              .replace("blue-400", "96 165 250")}
            height={28}
          />
        </div>
      ) : (
        <div className="mt-2 h-8" />
      )}
    </Card>
  )
}

function Legend({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-[#697386] dark:text-zinc-500">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
      <span className="text-[#8e99a8] dark:text-zinc-600">({count})</span>
    </div>
  )
}

export default function DashboardPage() {
  const { t } = useT()
  const { data, isPending: initialLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [stats, monitors] = await Promise.all([api.stats.get(), api.monitors.list()])
      return { stats: stats as DashboardStats, monitors: monitors as MonitorRow[] }
    },
    refetchInterval: POLL_INTERVAL_MS,
  })
  const stats = data?.stats ?? null
  const monitors = data?.monitors ?? []

  const healthyCount = stats?.healthyCount ?? 0
  const downCount = stats?.downCount ?? 0
  const missedCount = stats?.missedCount ?? 0
  const pausedCount = stats?.pausedCount ?? 0
  const totalMonitors = healthyCount + downCount + missedCount + pausedCount

  const hbSpark = stats?.heartbeatsByHour ?? []

  if (initialLoading) {
    return (
      <div className="space-y-5">
        <h1 className="text-lg font-semibold text-[#1a1f36] dark:text-zinc-100">
          {t("dashboard.title")}
        </h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#1a1f36] dark:text-zinc-100">
          {t("dashboard.title")}
        </h1>
        <span className="text-[10px] text-[#8e99a8] dark:text-zinc-500">
          {t("dashboard.autoRefresh")}
        </span>
      </div>

      {/* Stat Cards with AnimatedCounter + real Sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t("dashboard.healthyMonitors")}
          value={healthyCount}
          icon={Heart}
          color="text-emerald-400"
          bgClass="bg-emerald-500/10"
          sparkData={hbSpark}
        />
        <StatCard
          label={t("dashboard.downMonitors")}
          value={downCount}
          icon={AlertTriangle}
          color="text-red-400"
          bgClass="bg-red-500/10"
          sparkData={hbSpark}
        />
        <StatCard
          label={t("dashboard.totalHeartbeats")}
          value={stats?.totalHeartbeats ?? 0}
          icon={Activity}
          color="text-amber-400"
          bgClass="bg-amber-500/10"
          suffix="(24h)"
          sparkData={hbSpark}
        />
        <StatCard
          label={t("dashboard.uptime")}
          value={stats?.uptimePercent ?? 0}
          icon={TrendingUp}
          color="text-blue-400"
          bgClass="bg-blue-500/10"
          suffix="%"
          sparkData={hbSpark}
        />
      </div>

      {/* Status Distribution — Donut only, no redundant bar */}
      {totalMonitors > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.statusDistribution")}</CardTitle>
            <span className="text-xs text-[#697386] dark:text-zinc-500">
              {totalMonitors}{" "}
              {totalMonitors !== 1 ? t("dashboard.monitors") : t("dashboard.monitor")}
            </span>
          </CardHeader>
          <CardBody>
            <div className="flex items-center gap-6">
              <div className="shrink-0">
                <DonutChart
                  segments={[
                    {
                      label: t("dashboard.healthy"),
                      value: healthyCount,
                      color: "rgb(16 185 129)",
                    },
                    { label: t("dashboard.missed"), value: missedCount, color: "rgb(245 158 11)" },
                    { label: t("dashboard.down"), value: downCount, color: "rgb(239 68 68)" },
                    { label: t("dashboard.paused"), value: pausedCount, color: "rgb(113 113 122)" },
                  ].filter((s) => s.value > 0)}
                  total={totalMonitors}
                  size={90}
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <Legend
                  color="bg-emerald-500"
                  label={t("dashboard.healthy")}
                  count={healthyCount}
                />
                <Legend color="bg-amber-500" label={t("dashboard.missed")} count={missedCount} />
                <Legend color="bg-red-500" label={t("dashboard.down")} count={downCount} />
                <Legend color="bg-zinc-600" label={t("dashboard.paused")} count={pausedCount} />
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Monitors table with highlight rows */}
      {monitors.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={t("dashboard.noMonitors")}
          description={t("dashboard.noMonitorsDesc")}
          action={{ label: t("dashboard.createMonitor"), href: "/monitors/new" }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.monitors")}</CardTitle>
            <span className="text-xs text-[#697386] dark:text-zinc-500">
              {monitors.length}{" "}
              {monitors.length !== 1 ? t("dashboard.monitors") : t("dashboard.monitor")}
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8eaed] dark:border-zinc-800/80 text-left">
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("dashboard.monitor")}
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("dashboard.status")}
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("dashboard.lastPing")}
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("monitors.interval")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => {
                  const latestHb = m.latestHeartbeat
                  const isDown = m.status === "down"
                  const isMissed = m.status === "missed"
                  const isPaused = m.status === "paused"
                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-[#e8eaed] dark:border-zinc-800/50 transition-colors ${
                        isDown
                          ? "border-l-2 border-l-red-500 bg-red-50/20 dark:bg-red-950/10"
                          : isMissed
                            ? "border-l-2 border-l-amber-400 bg-amber-50/20 dark:bg-amber-950/10"
                            : isPaused
                              ? "opacity-50"
                              : "hover:bg-[#f6f8fa] dark:hover:bg-zinc-800/30"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/monitors/${m.id}`}
                          className="text-sm text-[#1a1f36] dark:text-zinc-100 hover:text-[#5e6ad2] dark:hover:text-emerald-400 transition-colors"
                        >
                          {m.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={m.status as "healthy" | "missed" | "down" | "paused"}
                          label={
                            m.status === "healthy"
                              ? t("dashboard.healthy")
                              : m.status === "missed"
                                ? t("dashboard.missed")
                                : m.status === "down"
                                  ? t("dashboard.down")
                                  : m.status === "pending"
                                    ? t("dashboard.pending")
                                    : t("dashboard.paused")
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-[#697386] dark:text-zinc-400">
                        {latestHb
                          ? formatRelativeTime(new Date(latestHb.receivedAt))
                          : t("common.never")}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#697386] dark:text-zinc-400">
                        {m.expectedIntervalSeconds}s
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
