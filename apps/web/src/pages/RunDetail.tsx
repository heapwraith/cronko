import { formatRelativeTime } from "@cronko/shared/utils"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { useParams } from "react-router"
import { runOutput } from "@/components/monitors/RunHistory"
import { Breadcrumb } from "@/components/shared/Breadcrumb"
import { Button } from "@/components/shared/Button"
import { CopyButton } from "@/components/shared/CopyButton"
import { Skeleton } from "@/components/shared/Skeleton"
import { Stamp } from "@/components/shared/Stamp"
import { api } from "@/lib/api"
import { formatRunDuration } from "@/lib/format"
import { useT } from "@/lib/i18n"
import NotFound from "@/pages/NotFound"

type Run = Awaited<ReturnType<typeof api.monitors.run>>["run"]

const card = "rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]"

/** Lines that usually carry the cause of a failure. */
const ERROR_LINE = /\b(error|fatal|exception|panic|traceback|failed)\b/i

const isFailed = (run: Pick<Run, "exitCode">) => run.exitCode != null && run.exitCode !== 0

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-sm text-dim">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-sm tnum">{children}</dd>
    </div>
  )
}

/** The job's own output, shown as a terminal log. */
function Output({ title, run, id }: { title: string; run: Run; id: string }) {
  const { t, locale } = useT()
  const output = runOutput(run)
  return (
    <section aria-labelledby={id} className={`${card} flex min-w-0 flex-col`}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <h2 id={id} className="truncate text-base">
            {title}
          </h2>
          <time dateTime={run.receivedAt} className="hidden text-sm text-dim sm:inline">
            {formatRelativeTime(new Date(run.receivedAt), locale)}
          </time>
        </div>
        {output && <CopyButton text={output} />}
      </header>
      {output ? (
        <pre className="max-h-[32rem] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-b-xl bg-ground px-5 py-4 font-mono text-[13px] leading-relaxed text-ink">
          {output.split("\n").map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: log lines are static and may repeat
            <span key={i} className={ERROR_LINE.test(line) ? "block text-down" : "block"}>
              {line || " "}
            </span>
          ))}
        </pre>
      ) : (
        <p className="px-5 py-6 text-sm text-dim">{t("detail.noOutput")}</p>
      )}
    </section>
  )
}

export default function RunDetailPage() {
  const { id = "", runId = "" } = useParams()
  const { t, locale } = useT()
  const { data, error, isPending } = useQuery({
    queryKey: ["run", id, runId],
    queryFn: async () => ({
      monitor: await api.monitors.get(id),
      ctx: await api.monitors.run(id, runId),
    }),
  })

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }
  if (error || !data) return <NotFound />

  const { monitor, ctx } = data
  const { run, previous, previousGood, nextId } = ctx
  const failed = isFailed(run)
  const when = new Date(run.receivedAt)
  const base = `/monitors/${monitor.id}/runs`

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: t("nav.monitors"), href: "/monitors" },
          { label: monitor.name, href: `/monitors/${monitor.id}` },
          { label: t("run.title") },
        ]}
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl leading-tight">{monitor.name}</h1>
            <Stamp
              tone={failed ? "failed" : "healthy"}
              label={failed ? t("detail.exitFail") : t("detail.exitOk")}
            />
          </div>
          <p className="text-sm text-dim">
            <time dateTime={run.receivedAt} className="tnum text-ink">
              {when.toLocaleString(locale, { dateStyle: "medium", timeStyle: "medium" })}
            </time>
            <span> · {formatRelativeTime(when, locale)}</span>
          </p>
        </div>

        <nav aria-label={t("run.title")} className="flex gap-2">
          {previous ? (
            <Button variant="secondary" size="sm" href={`${base}/${previous.id}`}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("run.previous")}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("run.previous")}
            </Button>
          )}
          {nextId ? (
            <Button variant="secondary" size="sm" href={`${base}/${nextId}`}>
              {t("run.next")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled>
              {t("run.next")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </nav>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Output title={t("detail.output")} run={run} id="run-output" />

        <section aria-labelledby="run-facts" className={`${card} px-5 py-3`}>
          <h2 id="run-facts" className="sr-only">
            {t("run.title")}
          </h2>
          <dl>
            <Fact label={t("board.exit")}>
              <span className={failed ? "font-semibold text-failed" : ""}>
                {run.exitCode ?? "—"}
              </span>
            </Fact>
            <Fact label={t("board.duration")}>{formatRunDuration(run.durationMs)}</Fact>
            <Fact label={t("detail.source")}>{run.sourceIp ?? "—"}</Fact>
            <Fact label={t("run.userAgent")}>
              <span title={run.userAgent ?? undefined}>{run.userAgent ?? "—"}</span>
            </Fact>
          </dl>
        </section>
      </div>

      {failed && (
        <div className="space-y-3">
          <p className="text-sm text-dim">{t("run.failedHint")}</p>
          {previousGood ? (
            <Output title={t("run.lastGood")} run={previousGood} id="run-good" />
          ) : (
            <p className={`${card} px-5 py-4 text-sm text-dim`}>{t("run.noGood")}</p>
          )}
        </div>
      )}
    </div>
  )
}
