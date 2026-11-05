import { t } from "@cronko/shared/translations"
import { formatDuration, formatRelativeTime } from "@cronko/shared/utils"
import { AlertTriangle, CheckCircle2, Pencil } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Sparkline } from "@/components/dashboard/Sparkline"
import { HeartbeatHistory } from "@/components/monitors/HeartbeatHistory"
import { MonitorActions } from "@/components/monitors/MonitorActions"
import { NextPingCountdown } from "@/components/monitors/NextPingCountdown"
import { Breadcrumb } from "@/components/shared/Breadcrumb"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card"
import { CopyButton } from "@/components/shared/CopyButton"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { api } from "@/lib/api"

export default async function MonitorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let monitor: {
    id: string
    name: string
    status: string
    expectedIntervalSeconds: number
    gracePeriodSeconds: number
    paused: boolean
    slug: string
    token: string
    createdAt: string
    updatedAt: string
    recentHeartbeats: Array<{
      id: string
      monitorId: string
      receivedAt: string
      sourceIp: string | null
      userAgent: string | null
      durationMs: number | null
      exitCode: number | null
      body?: string | null
    }>
    openIncident: {
      id: string
      monitorId: string
      status: string
      startedAt: string
      resolvedAt: string | null
    } | null
  } | null = null

  let incidents: Array<{
    id: string
    monitorId: string
    status: string
    startedAt: string
    resolvedAt: string | null
  }> = []

  try {
    monitor = await api.monitors.get(id)
    incidents = await api.monitors.incidents(id, { limit: 20 })
  } catch (e) {
    if (!(e instanceof Error && e.message === "API 404")) {
      // eslint-disable-next-line no-console
      console.error("Failed to load monitor:", e)
    }
  }
  if (!monitor) notFound()

  const pingUrl = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/ping/${monitor.token}`
  const latestHeartbeat = monitor.recentHeartbeats[0]

  const durationData = monitor.recentHeartbeats
    .filter((hb) => hb.durationMs !== null && hb.durationMs !== undefined && hb.durationMs > 0)
    .reverse()
    .slice(-30)
    .map((hb) => hb.durationMs!)

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  let avg = 0,
    p50 = 0,
    p95 = 0
  if (durationData.length > 0) {
    avg = durationData.reduce((s, v) => s + v, 0) / durationData.length
    const sorted = [...durationData].sort((a, b) => a - b)
    p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0
    p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0
  }

  const hbsWithExit = monitor.recentHeartbeats.filter(
    (hb) => hb.exitCode !== null && hb.exitCode !== undefined,
  )
  const successCount = hbsWithExit.filter((hb) => hb.exitCode === 0).length
  const failCount = hbsWithExit.length - successCount

  const statusLabel = monitor.paused
    ? t("pt-BR", "monitor.paused")
    : monitor.status === "healthy"
      ? t("pt-BR", "monitor.healthy")
      : monitor.status === "missed"
        ? t("pt-BR", "monitor.missed")
        : monitor.status === "down"
          ? t("pt-BR", "monitor.down")
          : monitor.status === "pending"
            ? t("pt-BR", "dashboard.pending")
            : monitor.status

  const createdAgo = formatDuration(Date.now() - new Date(monitor.createdAt).getTime())
  const statusDuration = formatDuration(Date.now() - new Date(monitor.updatedAt).getTime())

  const last5 = monitor.recentHeartbeats.slice(0, 5)

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: t("pt-BR", "nav.dashboard"), href: "/dashboard" },
          { label: t("pt-BR", "nav.monitors"), href: "/monitors" },
          { label: monitor.name },
        ]}
      />

      {monitor.openIncident && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {t("pt-BR", "monitor.incidentInProgress")}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("pt-BR", "monitor.incidentStarted")}{" "}
              {formatRelativeTime(new Date(monitor.openIncident.startedAt))} —{" "}
              {monitor.status === "down"
                ? t("pt-BR", "monitor.monitorIsDown")
                : monitor.status === "missed"
                  ? t("pt-BR", "monitor.monitorMissedPing")
                  : t("pt-BR", "monitor.awaitingRecovery")}
            </p>
          </div>
        </div>
      )}

      {!monitor.openIncident && monitor.status === "healthy" && monitor.updatedAt && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {t("pt-BR", "monitor.allOperational")}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {t("pt-BR", "monitor.healthyFor", { status: statusLabel, duration: statusDuration })}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[#1a1f36] dark:text-zinc-100">
            {monitor.name}
          </h1>
          <StatusBadge status={monitor.status as import("@cronko/shared/types").MonitorStatus} />
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/monitors/${monitor.id}/heartbeats?limit=1000&format=csv`}
            className="inline-flex items-center gap-1 rounded-lg border border-[#e8eaed] dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-[#697386] dark:text-zinc-400 hover:bg-[#f6f8fa] dark:hover:bg-zinc-800 transition-colors"
          >
            {t("pt-BR", "monitor.csv")}
          </a>
          <MonitorActions monitorId={monitor.id} status={monitor.status} />
        </div>
      </div>

      <Card status={monitor.status as import("@cronko/shared/types").MonitorStatus}>
        <CardHeader>
          <CardTitle>{t("pt-BR", "monitor.overview")}</CardTitle>
          <div className="flex items-center gap-3 text-xs text-[#8e99a8] dark:text-zinc-500">
            <span>
              {t("pt-BR", "monitor.created")} {createdAgo} {t("pt-BR", "common.ago")}
            </span>
            <Link
              href={`/monitors/${monitor.id}/edit`}
              className="inline-flex items-center gap-1 text-[#697386] dark:text-zinc-500 hover:text-[#5e6ad2] dark:hover:text-emerald-400 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              {t("pt-BR", "monitors.edit")}
            </Link>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <code className="text-sm text-[#1a1f36] dark:text-zinc-300 truncate">{pingUrl}</code>
            <CopyButton text={pingUrl} />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-[#697386] dark:text-zinc-500">
                {t("pt-BR", "monitor.lastPing")}
              </p>
              <p className="text-sm font-medium text-[#1a1f36] dark:text-zinc-100">
                {latestHeartbeat
                  ? formatRelativeTime(new Date(latestHeartbeat.receivedAt))
                  : t("pt-BR", "monitor.never")}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#697386] dark:text-zinc-500">
                {t("pt-BR", "monitor.nextPing")}
              </p>
              <p className="text-sm font-medium text-[#1a1f36] dark:text-zinc-100">
                <NextPingCountdown
                  lastPingIso={latestHeartbeat?.receivedAt ?? null}
                  intervalSeconds={monitor.expectedIntervalSeconds}
                />
              </p>
            </div>
            <div>
              <p className="text-xs text-[#697386] dark:text-zinc-500">
                {t("pt-BR", "monitor.grace")}
              </p>
              <p className="text-sm font-medium text-[#1a1f36] dark:text-zinc-100">
                {monitor.gracePeriodSeconds}s
              </p>
            </div>
            {hbsWithExit.length > 0 && (
              <div>
                <p className="text-xs text-[#697386] dark:text-zinc-500">
                  {t("pt-BR", "monitor.exitCode")}
                </p>
                <p className="text-sm font-medium text-[#1a1f36] dark:text-zinc-100">
                  <span className="text-emerald-500">{successCount}</span>
                  <span className="text-[#8e99a8]">/</span>
                  <span className="text-red-400">{failCount > 0 ? failCount : "0"}</span>
                  <span className="text-xs text-[#8e99a8] ml-1">
                    {t("pt-BR", "monitor.okFail")}
                  </span>
                </p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("pt-BR", "monitor.responseTime")}</CardTitle>
          </CardHeader>
          <CardBody>
            {durationData.length < 2 ? (
              <p className="text-xs text-[#8e99a8] dark:text-zinc-500">
                {t("pt-BR", "monitor.notEnoughData")}
              </p>
            ) : (
              <>
                <Sparkline data={durationData} color="rgb(52 211 153)" height={48} />
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider text-[#8e99a8] dark:text-zinc-500">
                      {t("pt-BR", "monitor.avg")}
                    </p>
                    <p className="text-sm font-semibold text-[#1a1f36] dark:text-zinc-100">
                      {formatMs(avg)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider text-[#8e99a8] dark:text-zinc-500">
                      P50
                    </p>
                    <p className="text-sm font-semibold text-[#1a1f36] dark:text-zinc-100">
                      {formatMs(p50)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider text-[#8e99a8] dark:text-zinc-500">
                      P95
                    </p>
                    <p className="text-sm font-semibold text-[#1a1f36] dark:text-zinc-100">
                      {formatMs(p95)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <HeartbeatHistory heartbeats={monitor.recentHeartbeats} />
      </div>

      {last5.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("pt-BR", "monitor.recentPings")}</CardTitle>
            <span className="text-xs text-[#8e99a8] dark:text-zinc-500">
              {t("pt-BR", "monitor.lastPings", { count: last5.length })}
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8eaed] dark:border-zinc-800/80 text-left">
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("pt-BR", "monitor.time")}
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("pt-BR", "monitor.duration")}
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("pt-BR", "monitor.exit")}
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("pt-BR", "monitor.log")}
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("pt-BR", "monitor.source")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {last5.map((hb) => (
                  <tr key={hb.id} className="border-b border-[#e8eaed] dark:border-zinc-800/50">
                    <td className="px-4 py-2 text-sm text-[#697386] dark:text-zinc-400">
                      {new Date(hb.receivedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-sm text-[#1a1f36] dark:text-zinc-100">
                      {hb.durationMs !== null && hb.durationMs !== undefined
                        ? formatMs(hb.durationMs)
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {hb.exitCode === null || hb.exitCode === undefined ? (
                        <span className="text-[#8e99a8]">—</span>
                      ) : hb.exitCode === 0 ? (
                        <span className="text-emerald-500 font-mono text-xs">{hb.exitCode}</span>
                      ) : (
                        <span className="text-red-400 font-mono text-xs">{hb.exitCode}</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-2 text-sm text-[#697386] dark:text-zinc-400 truncate max-w-48"
                      title={hb.body ?? undefined}
                    >
                      {hb.body?.length
                        ? hb.body.slice(0, 40) + (hb.body.length > 40 ? "..." : "")
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-sm text-[#697386] dark:text-zinc-400 truncate max-w-32">
                      {hb.sourceIp ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {incidents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("pt-BR", "monitor.incidents")}</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8eaed] dark:border-zinc-800/80 text-left">
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("pt-BR", "monitor.started")}
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("pt-BR", "monitor.resolved")}
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("pt-BR", "incidents.duration")}
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-[#697386] dark:text-zinc-500">
                    {t("pt-BR", "incidents.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc) => {
                  const started = new Date(inc.startedAt)
                  const resolved = inc.resolvedAt ? new Date(inc.resolvedAt) : null
                  return (
                    <tr key={inc.id} className="border-b border-[#e8eaed] dark:border-zinc-800/50">
                      <td className="px-4 py-2.5 text-sm text-[#697386] dark:text-zinc-400">
                        {started.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-[#697386] dark:text-zinc-400">
                        {resolved ? resolved.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-[#697386] dark:text-zinc-400">
                        {resolved
                          ? formatDuration(resolved.getTime() - started.getTime())
                          : t("pt-BR", "monitor.ongoing")}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${inc.status === "open" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}
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
        </Card>
      )}
    </div>
  )
}
