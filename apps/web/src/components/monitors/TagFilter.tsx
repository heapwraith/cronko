import { tagCounts } from "@cronko/shared/tags"
import { ChevronDown, Tag } from "lucide-react"
import { useId } from "react"
import { useSearchParams } from "react-router"
import { useT } from "@/lib/i18n"

/** The active tag filter, kept in the URL (?tag=) so it survives reloads and links. */
export function useTagFilter(): [string, (tag: string) => void] {
  const [params, setParams] = useSearchParams()
  const tag = params.get("tag") ?? ""
  const setTag = (next: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next) p.set("tag", next)
        else p.delete("tag")
        return p
      },
      { replace: true },
    )
  return [tag, setTag]
}

/** A native select of every tag in use, with counts. Hidden when nothing is tagged. */
export function TagFilter({
  monitors,
  value,
  onChange,
}: {
  monitors: readonly { tags?: readonly string[] | null }[]
  value: string
  onChange: (tag: string) => void
}) {
  const { t } = useT()
  const id = useId()
  const counts = tagCounts(monitors)
  if (counts.length === 0 && !value) return null

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {t("tags.filter")}
      </label>
      <Tag
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim"
        aria-hidden="true"
      />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-10 appearance-none rounded-md border border-line-strong bg-ground py-2 pl-9 pr-8 text-sm text-ink focus-visible:outline-2"
      >
        <option value="">{t("tags.all")}</option>
        {counts.map(({ tag, count }) => (
          <option key={tag} value={tag}>
            {tag} ({count})
          </option>
        ))}
        {value && !counts.some((c) => c.tag === value) && (
          <option value={value}>{value} (0)</option>
        )}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-dim"
        aria-hidden="true"
      />
    </div>
  )
}
