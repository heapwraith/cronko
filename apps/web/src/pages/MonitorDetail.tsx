import type { MonitorStatus } from "@cronko/shared/types"
import { formatDuration, formatRelativeTime } from "@cronko/shared/utils"
import { useQuery } from "@tanstack/react-query"
import { CircleCheck, CircleX, Clock, Download, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"
import { useParams } from "react-router"
import { DurationBars } from "@/components/monitors/DurationBars"
import { MonitorActions } from "@/components/monitors/MonitorActions"
import { NextPingCountdown } from "@/components/monitors/NextPingCountdown"
import { RunHistory, runOutput } from "@/components/monitors/RunHistory"
import { Breadcrumb } from "@/components/shared/Breadcrumb"
import { Button } from "@/components/shared/Button"
import { CopyButton } from "@/components/shared/CopyButton"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { api } from "@/lib/api"
import { formatInterval, formatRunDuration } from "@/lib/format"
import { useT } from "@/lib/i18n"
import NotFound from "@/pages/NotFound"
import MonitorDetailSkeleton from "@/pages/skeletons/MonitorDetailSkeleton"

type Monitor = Awaited<ReturnType<typeof api.monitors.get>>
type Incident = Awaited<ReturnType<typeof api.monitors.incidents>>[number]

export default function MonitorDetailPage() {
  const { id = "" } = useParams()
  const { data, error, isPending } = useQuery({
    queryKey: ["monitor", id],
    queryFn: async () => ({
      monitor: await api.monitors.get(id),
      incidents: await api.monitors.incidents(id, { limit: 20 }),
    }),
    refetchInterval: 15_000,
  })

  if (isPending) return <MonitorDetailSkeleton />
  if (error || !data) return <NotFound />
  return <MonitorDetailView monitor={data.monitor} incidents={data.incidents} />
}

function Panel({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-[6px] border border-line bg-panel p-4">
      <h2 id={id} className="mb-3 text-sm font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-dim">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tnum">{children}</dd>
    </div>
  )
}

const CAUSE_ICON = { failed: CircleX, down: TriangleAlert, missed: Clock } as const

function MonitorDetailView({ monitor, incidents }: { monitor: Monitor; incidents: Incident[] }) {
  const { t, locale } = useT()
  const status = monitor.status as MonitorStatus
  const runs = monitor.recentHeartbeats
  const last = runs[0]
  const lastOutput = last ? runOutput(last) : null
  const lastFailed = last?.exitCode != null && last.exitCode !== 0

  const pingUrl = `${window.location.origin}/ping/${monitor.token}`
  const csvUrl = `/api/monitors/${monitor.id}/heartbeats?limit=1000&format=csv`

  const points = [...runs]
    .reverse()
    .filter((r) => r.durationMs != null && r.durationMs > 0)
    .slice(-40)
    .map((r) => ({
      id: r.id,
      durationMs: r.durationMs as number,
      failed: r.exitCode != null && r.exitCode !== 0,
      label: new Date(r.receivedAt).toLocaleString(locale),
    }))

  const incident = monitor.openIncident
  const CauseIcon =
    incident && status in CAUSE_ICON ? CAUSE_ICON[status as keyof typeof CAUSE_ICON] : TriangleAlert
  const cause =
    status === "failed"
      ? t("monitor.monitorFailed")
      : status === "down"
        ? t("monitor.monitorIsDown")
        : status === "missed"
          ? t("monitor.monitorMissedPing")
          : t("monitor.awaitingRecovery")

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: t("nav.dashboard"), href: "/dashboard" },
          { label: t("nav.monitors"), href: "/monitors" },
          { label: monitor.name },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{monitor.name}</h1>
          <StatusBadge status={status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button href={csvUrl} variant="ghost" size="sm" target="_blank" rel="noreferrer">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {t("detail.exportCsv")}
          </Button>
          <MonitorActions monitorId={monitor.id} status={monitor.status} />
        </div>
      </div>

      {incident && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-[6px] border border-line-strong bg-[color-mix(in_oklch,var(--st-down)_9%,var(--panel))] p-4"
        >
          <CauseIcon className="mt-0.5 h-5 w-5 shrink-0 text-down" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{t("monitor.incidentInProgress")}</p>
            <p className="text-sm text-dim">
              {t("monitor.incidentStarted")}{" "}
              {formatRelativeTime(new Date(incident.startedAt), locale)} — {cause}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Panel id="last-run" title={t("detail.lastRun")}>
            {last ? (
              <>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Fact label={t("detail.when")}>
                    {formatRelativeTime(new Date(last.receivedAt), locale)}
                  </Fact>
                  <Fact label={t("board.duration")}>{formatRunDuration(last.durationMs)}</Fact>
                  <Fact label={t("board.exit")}>
                    <span className="inline-flex items-center gap-1.5">
                      {last.exitCode == null ? (
                        "—"
                      ) : lastFailed ? (
                        <>
                          <CircleX className="h-4 w-4 text-failed" aria-hidden="true" />
                          <span className="font-semibold text-failed">
                            {last.exitCode} · {t("detail.exitFail")}
                          </span>
                        </>
                      ) : (
                        <>
                          <CircleCheck className="h-4 w-4 text-healthy" aria-hidden="true" />
                          {last.exitCode} · {t("detail.exitOk")}
                        </>
                      )}
                    </span>
                  </Fact>
                  <Fact label={t("detail.source")}>{last.sourceIp ?? "—"}</Fact>
                </dl>
                <h3 className="mb-1.5 mt-5 text-xs font-semibold uppercase tracking-wider text-dim">
                  {t("detail.output")}
                </h3>
                {lastOutput ? (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[4px] bg-ground p-3 font-mono text-xs">
                    {lastOutput}
                  </pre>
                ) : (
                  <p className="text-sm text-dim">{t("detail.noOutput")}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-dim">{t("detail.neverRan")}</p>
            )}
          </Panel>
        </div>

        <div className="lg:col-span-2">
          <Panel id="schedule" title={t("detail.schedule")}>
            <dl className="grid grid-cols-2 gap-4">
              {monitor.scheduleCron ? (
                <Fact label={t("form.cron")}>
                  {monitor.scheduleCron}
                  <span className="block text-xs text-dim">{monitor.timezone ?? "UTC"}</span>
                </Fact>
              ) : (
                <Fact label={t("detail.interval")}>
                  {formatInterval(monitor.expectedIntervalSeconds)}
                </Fact>
              )}
              <Fact label={t("detail.grace")}>{formatInterval(monitor.gracePeriodSeconds)}</Fact>
              <Fact label={t("detail.nextExpected")}>
                <NextPingCountdown dueIso={monitor.paused ? null : monitor.nextExpectedAt} />
              </Fact>
              <Fact label={t("detail.maxDuration")}>
                {monitor.maxDurationMs ? formatDuration(monitor.maxDurationMs) : "—"}
              </Fact>
            </dl>
          </Panel>
        </div>
      </div>

      <Panel id="ping-url" title={t("detail.pingUrl")}>
        <div className="flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap rounded-[4px] bg-ground px-3 py-2 font-mono text-sm">
            {pingUrl}
          </code>
          <CopyButton text={pingUrl} />
        </div>
        <p className="mt-2 font-mono text-xs text-dim">
          {pingUrl}/start · {pingUrl}/fail
        </p>
      </Panel>

      {points.length > 0 && (
        <Panel id="durations" title={t("detail.durations")}>
          <DurationBars points={points} />
        </Panel>
      )}

      <section aria-labelledby="history" className="space-y-2">
        <h2 id="history" className="text-sm font-semibold">
          {t("detail.history")}
        </h2>
        {runs.length > 0 ? (
          <RunHistory runs={runs} caption={t("detail.history")} />
        ) : (
          <p className="text-sm text-dim">{t("detail.neverRan")}</p>
        )}
      </section>

      <section aria-labelledby="incidents" className="space-y-2">
        <h2 id="incidents" className="text-sm font-semibold">
          {t("detail.incidents")}
        </h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-dim">{t("detail.noIncidents")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-[6px] border border-line bg-panel">
            {incidents.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
              >
                <span className="font-mono text-xs tnum">
                  {new Date(i.startedAt).toLocaleString(locale)}
                </span>
                <span className={i.resolvedAt ? "text-dim" : "font-semibold text-down"}>
                  {i.resolvedAt
                    ? t("detail.resolvedAfter", {
                        time: formatDuration(
                          new Date(i.resolvedAt).getTime() - new Date(i.startedAt).getTime(),
                        ),
                      })
                    : t("detail.open")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
