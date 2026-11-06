import type { MonitorStatus } from "@cronko/shared/types"
import { Check, CircleDashed, OctagonX, Pause, TriangleAlert, X } from "lucide-react"
import { useT } from "@/lib/i18n"
import { statusKey } from "@/lib/status"

/**
 * Solid chip like a departures board. Each state has its own glyph shape plus
 * the label, so colour is never the only signal.
 */
const CHIP: Record<
  MonitorStatus,
  { cls: string; Glyph: React.ComponentType<{ className?: string }> }
> = {
  healthy: { cls: "bg-[var(--chip-healthy-bg)] text-[var(--chip-healthy-fg)]", Glyph: Check },
  missed: { cls: "bg-[var(--chip-missed-bg)] text-[var(--chip-missed-fg)]", Glyph: TriangleAlert },
  down: { cls: "bg-[var(--chip-down-bg)] text-[var(--chip-down-fg)]", Glyph: OctagonX },
  failed: { cls: "bg-[var(--chip-failed-bg)] text-[var(--chip-failed-fg)]", Glyph: X },
  paused: { cls: "bg-[var(--chip-paused-bg)] text-[var(--chip-paused-fg)]", Glyph: Pause },
  pending: {
    cls: "bg-[var(--chip-pending-bg)] text-[var(--chip-pending-fg)]",
    Glyph: CircleDashed,
  },
}

export function StatusBadge({ status, label }: { status: MonitorStatus; label?: string }) {
  const { t } = useT()
  const { cls, Glyph } = CHIP[status] ?? CHIP.pending
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${cls}`}
    >
      <Glyph className="h-3 w-3" aria-hidden="true" />
      {label ?? t(statusKey(status))}
    </span>
  )
}
