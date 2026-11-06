import { formatRunDuration } from "@/lib/format"
import { useT } from "@/lib/i18n"

export interface DurationPoint {
  id: string
  durationMs: number
  failed: boolean
  label: string
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
}

/** Run durations, oldest to newest. Failed runs use the failed hue and a hatch. */
export function DurationBars({ points }: { points: DurationPoint[] }) {
  const { t } = useT()
  if (points.length === 0) return null

  const sorted = points.map((p) => p.durationMs).sort((a, b) => a - b)
  const max = sorted[sorted.length - 1] ?? 1
  const median = percentile(sorted, 0.5)
  const p95 = percentile(sorted, 0.95)

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
            title={`${p.label} · ${formatRunDuration(p.durationMs)}`}
            style={{ height: `${Math.max(4, (p.durationMs / max) * 100)}%` }}
            className={`min-w-1 flex-1 rounded-t-[2px] ${
              p.failed
                ? "bg-[repeating-linear-gradient(135deg,var(--st-failed)_0_3px,transparent_3px_6px)] outline outline-1 -outline-offset-1 outline-failed"
                : "bg-healthy/70"
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
