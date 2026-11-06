import type { ComponentType } from "react"
import { Button } from "./Button"

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  action?: { label: string; href: string }
}

/** Nothing here yet: say why, and offer the one next step. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-[4px] border border-dashed border-line-strong bg-panel px-6 py-14 text-center">
      <Icon className="mb-4 h-8 w-8 text-dim" aria-hidden="true" />
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-dim">{description}</p>
      {action && (
        <Button href={action.href} className="mt-5">
          {action.label}
        </Button>
      )}
    </div>
  )
}

// Domain empty states keep their old export names so callers do not change.
import { Activity, AlertTriangle, History } from "lucide-react"
import { useT } from "@/lib/i18n"

export function NoMonitorsEmptyState() {
  const { t } = useT()
  return (
    <EmptyState
      icon={Activity}
      title={t("dashboard.noMonitors")}
      description={t("dashboard.noMonitorsDesc")}
      action={{ label: t("dashboard.createMonitor"), href: "/monitors/new" }}
    />
  )
}

export function NoIncidentsEmptyState() {
  const { t } = useT()
  return (
    <EmptyState
      icon={AlertTriangle}
      title={t("incidents.noIncidents")}
      description={t("incidents.noIncidentsDesc")}
    />
  )
}

export function NoHeartbeatsEmptyState() {
  const { t } = useT()
  return (
    <EmptyState
      icon={History}
      title={t("monitor.noHeartbeats")}
      description={t("monitor.noHeartbeatsDesc")}
    />
  )
}
