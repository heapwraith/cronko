import { durationStats } from "@cronko/shared/run-stats"
import { formatRunDuration } from "@/lib/format"
import { useT } from "@/lib/i18n"

export interface DurationPoint {
  id: string
  durationMs: number
  failed: boolean
  /** Clearly slower than the runs before it (see isUnusuallySlow). */
  slow?: boolean
  label: string
}

const HATCH =
  "repeating-linear-gradient(45deg, transparent 0 3px, color-mix(in oklch, var(--ground) 55%, transparent) 3px 5px)"

/** Run durations, oldest to newest. Failed runs use the failed hue and a hatch. */
export function DurationBars({ points }: { points: DurationPoint[] }) {
  const { t } = useT()
  if (points.length === 0) return null

  const stats = durationStats(points.map((p) => p.durationMs))
  const max = stats?.max || 1
  const median = stats?.p50 ?? 0
  const p95 = stats?.p95 ?? 0

  const summary = `${t("detail.durations")}: ${t("detail.median")} ${formatRunDuration(median)}, p95 ${formatRunDuration(p95)}, max ${formatRunDuration(max)}`

  return (
    <div>
      <div
        role="img"
        aria-label={summary}
        className="flex h-24 items-end gap-[3px] border-b border-line-strong"
      >
        {points.map((p) => (
          <div
            key={p.id}
            title={`${p.label} · ${formatRunDuration(p.durationMs)}${p.slow ? ` · ${t("analytics.slow")}` : ""}`}
            style={{
              height: `${Math.max(4, (p.durationMs / max) * 100)}%`,
              // Failed runs are hatched, so they differ by pattern and not by colour alone.
              ...(p.failed && { backgroundImage: HATCH }),
            }}
            className={`min-w-1 max-w-6 flex-1 rounded-t-[2px] ${
              p.failed ? "bg-failed" : p.slow ? "bg-missed" : "bg-healthy/70"
            }`}
          />
        ))}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-dim">
        <div className="flex gap-1.5">
          <dt>{t("detail.median")}</dt>
          <dd className="font-mono text-ink tnum">{formatRunDuration(median)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>p95</dt>
          <dd className="font-mono text-ink tnum">{formatRunDuration(p95)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>max</dt>
          <dd className="font-mono text-ink tnum">{formatRunDuration(max)}</dd>
        </div>
      </dl>
    </div>
  )
}
