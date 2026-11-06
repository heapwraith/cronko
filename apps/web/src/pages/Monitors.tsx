import { useQuery } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { DeleteMonitorButton } from "@/components/monitors/DeleteMonitorButton"
import { DeparturesTable, sortBySeverity } from "@/components/monitors/DeparturesTable"
import { Button } from "@/components/shared/Button"
import { NoMonitorsEmptyState } from "@/components/shared/EmptyState"
import { SkeletonTable } from "@/components/shared/Skeleton"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

export default function MonitorsPage() {
  const { t } = useT()
  const { toast } = useToast()
  const searchId = useId()
  const [search, setSearch] = useState("")

  const {
    data: monitors = [],
    isPending,
    error,
  } = useQuery({ queryKey: ["monitors"], queryFn: () => api.monitors.list() })

  useEffect(() => {
    if (error) toast(t("monitors.failedLoad"), "error")
  }, [error, toast, t])

  const rows = sortBySeverity(monitors).filter((m) =>
    m.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("monitors.title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              {t("board.search")}
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("board.search")}
              className="min-h-10 w-64 rounded-[4px] border border-line-strong bg-panel pl-9 pr-3 text-sm text-ink placeholder:text-dim focus-visible:outline-2"
            />
          </div>
          <Button href="/monitors/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("dashboard.createMonitor")}
          </Button>
        </div>
      </div>

      {isPending ? (
        <SkeletonTable rows={6} cols={5} />
      ) : monitors.length === 0 ? (
        <NoMonitorsEmptyState />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-dim">{t("board.noResults")}</p>
      ) : (
        <DeparturesTable
          rows={rows}
          caption={t("board.caption")}
          actions={(m) => <DeleteMonitorButton monitorId={m.id} />}
        />
      )}
    </div>
  )
}
