import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { BulkBar } from "@/components/monitors/BulkBar"
import { DeleteMonitorButton } from "@/components/monitors/DeleteMonitorButton"
import { DeparturesTable, sortBySeverity } from "@/components/monitors/DeparturesTable"
import { TagFilter, useTagFilter } from "@/components/monitors/TagFilter"
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

  const [tag, setTag] = useTagFilter()
  // The search looks at the name, the slug and the tags.
  const query = search.trim().toLowerCase()
  const rows = sortBySeverity(monitors).filter(
    (m) =>
      (!query ||
        m.name.toLowerCase().includes(query) ||
        m.slug.toLowerCase().includes(query) ||
        m.tags.some((tg) => tg.includes(query))) &&
      (!tag || m.tags.includes(tag)),
  )

  // Selection survives filtering, but only monitors that still exist stay selected.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const live = new Set(monitors.map((m) => m.id))
  const chosen = [...selected].filter((id) => live.has(id))
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const toggleAll = (ids: string[], select: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (select) next.add(id)
        else next.delete(id)
      }
      return next
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl leading-tight">{t("monitors.title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <TagFilter monitors={monitors} value={tag} onChange={setTag} />
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
              className="min-h-10 w-64 rounded-md border border-line-strong bg-ground pl-9 pr-3 text-sm text-ink placeholder:text-dim focus-visible:outline-2"
            />
          </div>
          <Button href="/monitors/new">{t("dashboard.createMonitor")}</Button>
        </div>
      </div>

      {chosen.length > 0 && (
        <BulkBar
          ids={chosen}
          onDone={(ok) =>
            setSelected((prev) => {
              const next = new Set(prev)
              for (const id of ok) next.delete(id)
              return next
            })
          }
        />
      )}

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
          actions={(m) => <DeleteMonitorButton monitorId={m.id} name={m.name} />}
          selection={{ selected, onToggle: toggle, onToggleAll: toggleAll }}
        />
      )}
    </div>
  )
}
