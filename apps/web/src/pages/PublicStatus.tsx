import type { DayUptime, PublicState } from "@cronko/shared/status"
import { formatDuration, formatRelativeTime } from "@cronko/shared/utils"
import { useQuery } from "@tanstack/react-query"
import { CircleCheck, OctagonX, Pause, TriangleAlert } from "lucide-react"
import { useEffect } from "react"
import { useParams } from "react-router"
import { CronkoLogo } from "@/components/shared/CronkoLogo"
import { Stamp, type StampTone } from "@/components/shared/Stamp"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { useT } from "@/lib/i18n"

interface PublicStatusData {
  title: string
  description: string | null
  state: PublicState
  generatedAt: string
  monitors: { name: string; state: PublicState; uptime: number | null; days: DayUptime[] }[]
  incidents: { monitor: string; startedAt: string; resolvedAt: string | null }[]
}

class NotFoundError extends Error {}

/** Plain fetch: a visitor has no session, so the app's refresh-and-retry logic must not run. */
async function fetchStatus(slug: string): Promise<PublicStatusData> {
  const res = await fetch(`/public/status/${encodeURIComponent(slug)}`)
  if (res.status === 404) throw new NotFoundError()
  if (!res.ok) throw new Error(`status ${res.status}`)
  return ((await res.json()) as { data: PublicStatusData }).data
}

const TONE: Record<PublicState, StampTone> = {
  operational: "healthy",
  degraded: "missed",
  down: "down",
  paused: "paused",
}

const BANNER: Record<
  PublicState,
  { icon: React.ComponentType<{ className?: string }>; bg: string; fg: string }
> = {
  operational: {
    icon: CircleCheck,
    bg: "bg-[var(--chip-healthy-bg)]",
    fg: "text-[var(--chip-healthy-fg)]",
  },
  degraded: {
    icon: TriangleAlert,
    bg: "bg-[var(--chip-missed-bg)]",
    fg: "text-[var(--chip-missed-fg)]",
  },
  down: { icon: OctagonX, bg: "bg-[var(--chip-down-bg)]", fg: "text-[var(--chip-down-fg)]" },
  paused: { icon: Pause, bg: "bg-[var(--chip-paused-bg)]", fg: "text-[var(--chip-paused-fg)]" },
}

/** Day colour by availability; a missing day is neutral, never green. */
function dayClass(uptime: number | null): string {
  if (uptime === null) return "bg-line"
  if (uptime >= 0.999) return "bg-healthy"
  if (uptime >= 0.95) return "bg-missed"
  return "bg-down"
}

function UptimeBars({ days }: { days: DayUptime[] }) {
  const { t, locale } = useT()
  const pct = (u: number | null) =>
    u === null
      ? t("public.noData")
      : u.toLocaleString(locale, { style: "percent", maximumFractionDigits: 2 })
  return (
    <div>
      {/* Each bar has its own text label; the strip as a whole is summarised by the % above. */}
      <ol className="flex h-8 items-stretch gap-px overflow-hidden sm:gap-[2px]">
        {days.map((d) => {
          const label = t("public.dayLabel", {
            date: new Date(`${d.date}T12:00:00Z`).toLocaleDateString(locale, {
              day: "2-digit",
              month: "short",
            }),
            pct: pct(d.uptime),
          })
          return (
            <li
              key={d.date}
              title={label}
              className={`min-w-0 flex-1 rounded-[1px] sm:rounded-[2px] ${dayClass(d.uptime)}`}
            >
              <span className="sr-only">{label}</span>
            </li>
          )
        })}
      </ol>
      <div className="mt-1.5 flex justify-between text-xs text-dim" aria-hidden="true">
        <span>{t("public.days")}</span>
        <span>{t("public.today")}</span>
      </div>
    </div>
  )
}

export default function PublicStatusPage() {
  const { slug = "" } = useParams()
  const { t, locale } = useT()
  const { data, error, isPending } = useQuery({
    queryKey: ["public-status", slug],
    queryFn: () => fetchStatus(slug),
    refetchInterval: 60_000,
    retry: (count, err) => !(err instanceof NotFoundError) && count < 2,
  })

  useEffect(() => {
    if (data) document.title = `${data.title} · Status`
  }, [data])

  const pct = (u: number | null) =>
    u === null ? "—" : u.toLocaleString(locale, { style: "percent", maximumFractionDigits: 2 })

  return (
    <div className="min-h-screen bg-ground">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl leading-tight">{data?.title ?? " "}</h1>
            {data?.description && <p className="mt-2 text-base text-dim">{data.description}</p>}
          </div>
          <ThemeToggle />
        </header>

        {isPending ? (
          <div className="h-24 animate-pulse rounded-xl bg-panel" />
        ) : error || !data ? (
          <p className="rounded-xl border border-line bg-panel p-6 text-dim">
            {t("public.notFound")}
          </p>
        ) : (
          <main className="space-y-8">
            {(() => {
              const b = BANNER[data.state]
              const Icon = b.icon
              return (
                <div
                  role="status"
                  className={`flex items-center gap-3 rounded-xl px-5 py-4 ${b.bg} ${b.fg}`}
                >
                  <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                  <p className="text-lg font-semibold">{t(`public.state.${data.state}`)}</p>
                </div>
              )
            })()}

            <section className="rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
              {data.monitors.length === 0 ? (
                <p className="p-6 text-sm text-dim">{t("public.noMonitors")}</p>
              ) : (
                <ul>
                  {data.monitors.map((m) => (
                    <li key={m.name} className="space-y-3 border-b border-line p-5 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <h2 className="truncate text-base">{m.name}</h2>
                          <Stamp tone={TONE[m.state]} label={t(`public.pill.${m.state}`)} />
                        </div>
                        <span className="font-mono text-sm text-dim tnum">
                          {t("public.uptime", { pct: pct(m.uptime) })}
                        </span>
                      </div>
                      <UptimeBars days={m.days} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="public-incidents" className="space-y-3">
              <h2 id="public-incidents" className="text-base">
                {t("public.incidents")}
              </h2>
              {data.incidents.length === 0 ? (
                <p className="text-sm text-dim">{t("public.noIncidents")}</p>
              ) : (
                <ul className="rounded-xl border border-line bg-panel">
                  {data.incidents.map((i) => {
                    const start = new Date(i.startedAt)
                    const end = i.resolvedAt ? new Date(i.resolvedAt) : null
                    return (
                      <li
                        key={`${i.monitor}-${i.startedAt}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3 text-sm last:border-b-0"
                      >
                        <span className="font-medium text-ink">{i.monitor}</span>
                        <span className="text-dim">
                          <time dateTime={i.startedAt}>
                            {start.toLocaleString(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </time>
                          {" · "}
                          {end ? (
                            t("public.lasted", {
                              duration: formatDuration(end.getTime() - start.getTime()),
                            })
                          ) : (
                            <span className="font-semibold text-down">{t("public.ongoing")}</span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-dim">
              <span>
                {t("public.updated", {
                  time: formatRelativeTime(new Date(data.generatedAt), locale),
                })}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CronkoLogo className="h-3.5 w-3.5" />
                {t("public.poweredBy")}
              </span>
            </footer>
          </main>
        )}
      </div>
    </div>
  )
}
