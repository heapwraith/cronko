import type { MonitorStatus } from "@cronko/shared/types"
import { useT } from "@/lib/i18n"
import { statusKey } from "@/lib/status"

/**
 * Text-only chip, like a departures board. The label carries the meaning, so
 * colour is never the only signal.
 */
const CHIP: Record<MonitorStatus, string> = {
  healthy: "bg-[var(--chip-healthy-bg)] text-[var(--chip-healthy-fg)]",
  missed: "bg-[var(--chip-missed-bg)] text-[var(--chip-missed-fg)]",
  down: "bg-[var(--chip-down-bg)] text-[var(--chip-down-fg)]",
  failed: "bg-[var(--chip-failed-bg)] text-[var(--chip-failed-fg)]",
  paused: "bg-[var(--chip-paused-bg)] text-[var(--chip-paused-fg)]",
  pending: "bg-[var(--chip-pending-bg)] text-[var(--chip-pending-fg)]",
}

export function StatusBadge({ status, label }: { status: MonitorStatus; label?: string }) {
  const { t } = useT()
  return (
    <span
      className={`inline-block rounded-[4px] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${CHIP[status] ?? CHIP.pending}`}
    >
      {label ?? t(statusKey(status))}
    </span>
  )
}
