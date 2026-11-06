import type { ComponentType } from "react"

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  action?: {
    label: string
    href: string
  }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-12 text-center transition-colors">
      <div className="flex justify-center mb-4">
        <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-4">
          <Icon className="h-8 w-8 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
        </div>
      </div>
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{title}</h3>
      <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">{description}</p>
      {action && (
        <a
          href={action.href}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
        >
          {action.label}
        </a>
      )}
    </div>
  )
}

export function NoMonitorsEmptyState() {
  return (
    <EmptyState
      icon={({ className }) => (
        <svg
          className={className}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
      )}
      title="No monitors yet"
      description="Create your first monitor to start tracking cron jobs, backups, or ETL pipelines."
      action={{ label: "Create monitor", href: "/monitors/new" }}
    />
  )
}

export function NoIncidentsEmptyState() {
  return (
    <EmptyState
      icon={({ className }) => (
        <svg
          className={className}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      )}
      title="No incidents"
      description="All monitors are running smoothly. Incidents appear here when something goes wrong."
    />
  )
}

export function NoHeartbeatsEmptyState() {
  return (
    <EmptyState
      icon={({ className }) => (
        <svg
          className={className}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      )}
      title="No heartbeats received"
      description="This monitor hasn't received any pings yet. Use the ping URL to start sending heartbeats."
    />
  )
}
