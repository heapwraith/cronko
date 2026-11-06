import type { MonitorStatus } from "@cronko/shared/types"
import { CircleCheck, CircleX, Clock, Hourglass, Pause, TriangleAlert } from "lucide-react"
import { useT } from "@/lib/i18n"
import { statusKey } from "@/lib/status"

/** Every state has its own glyph shape, so colour is never the only signal. */
const META = {
  healthy: { Icon: CircleCheck, chip: "bg-[var(--chip-healthy-bg)] text-[var(--chip-healthy-fg)]" },
  missed: { Icon: Clock, chip: "bg-[var(--chip-missed-bg)] text-[var(--chip-missed-fg)]" },
  down: { Icon: TriangleAlert, chip: "bg-[var(--chip-down-bg)] text-[var(--chip-down-fg)]" },
  failed: { Icon: CircleX, chip: "bg-[var(--chip-failed-bg)] text-[var(--chip-failed-fg)]" },
  paused: { Icon: Pause, chip: "bg-[var(--chip-paused-bg)] text-[var(--chip-paused-fg)]" },
  pending: { Icon: Hourglass, chip: "bg-[var(--chip-pending-bg)] text-[var(--chip-pending-fg)]" },
} as const satisfies Record<MonitorStatus, { Icon: typeof Clock; chip: string }>

export function StatusBadge({ status, label }: { status: MonitorStatus; label?: string }) {
  const { t } = useT()
  const { Icon, chip } = META[status] ?? META.pending

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${chip}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {label ?? t(statusKey(status))}
    </span>
  )
}
