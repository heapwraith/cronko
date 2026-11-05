import type { MonitorStatus } from "@cronko/shared/types"
import { Tooltip } from "./Tooltip"

const variants: Record<
  MonitorStatus,
  { dot: string; bg: string; text: string; label: string; tooltip: string }
> = {
  healthy: {
    dot: "bg-emerald-400",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "Healthy",
    tooltip: "Monitor is running normally",
  },
  missed: {
    dot: "bg-amber-400",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    label: "Missed",
    tooltip: "Heartbeat is late but within grace period",
  },
  down: {
    dot: "bg-red-400",
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    label: "Down",
    tooltip: "Heartbeat missed — incident open",
  },
  paused: {
    dot: "bg-zinc-500",
    bg: "bg-zinc-200 dark:bg-zinc-700",
    text: "text-zinc-500 dark:text-zinc-300",
    label: "Paused",
    tooltip: "Monitoring is paused",
  },
  pending: {
    dot: "bg-blue-400",
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    label: "Pending",
    tooltip: "Awaiting first ping",
  },
}

export function StatusBadge({
  status,
  label,
  tooltip,
}: {
  status: MonitorStatus
  label?: string
  tooltip?: string
}) {
  const v = variants[status]

  return (
    <Tooltip content={tooltip ?? v.tooltip}>
      <span
        role="status"
        aria-label={`Status: ${label ?? v.label}`}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${v.bg} ${v.text} cursor-default ${status === "down" ? "animate-shake" : ""}`}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${v.dot} ${status === "healthy" ? "animate-pulse" : "animate-none"}`}
        />
        {label ?? v.label}
      </span>
    </Tooltip>
  )
}
