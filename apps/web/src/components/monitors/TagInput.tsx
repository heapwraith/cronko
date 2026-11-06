import { MAX_TAGS, normalizeTag, normalizeTags, tagCounts } from "@cronko/shared/tags"
import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"
import { useId, useState } from "react"
import { Link } from "react-router"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

/**
 * Chips plus a text field. Enter or comma adds the typed tag, Backspace on an empty
 * field removes the last one, and tags already used elsewhere are suggested.
 */
export function TagInput({
  value,
  onChange,
  label,
  hint,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  label: string
  hint: string
}) {
  const { t } = useT()
  const id = useId()
  const [draft, setDraft] = useState("")
  const { data: monitors = [] } = useQuery({
    queryKey: ["monitors"],
    queryFn: () => api.monitors.list(),
  })
  const suggestions = tagCounts(monitors)
    .map((c) => c.tag)
    .filter((tag) => !value.includes(tag))
  const full = value.length >= MAX_TAGS

  function commit(raw: string) {
    const next = normalizeTags([...value, ...raw.split(",")])
    if (next.length !== value.length) onChange(next)
    setDraft("")
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-ground px-2 py-1.5 focus-within:outline-2 focus-within:outline-signal-text">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-raised py-0.5 pl-2.5 pr-1 text-xs font-medium text-ink"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== tag))}
              aria-label={t("tags.remove", { tag })}
              className="rounded-full p-0.5 text-dim hover:bg-line hover:text-ink"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={full}
          list={`${id}-suggestions`}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            const v = e.target.value
            if (v.includes(",")) commit(v)
            else setDraft(v)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Inside the monitor form, Enter adds a tag instead of submitting.
              e.preventDefault()
              if (draft.trim()) commit(draft)
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          placeholder={full ? "" : t("tags.placeholder")}
          className="min-w-32 flex-1 bg-transparent px-1 text-sm text-ink placeholder:text-dim focus:outline-none disabled:cursor-not-allowed"
        />
        <datalist id={`${id}-suggestions`}>
          {suggestions.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </div>
      <p id={`${id}-hint`} className="mt-1 text-xs text-dim">
        {hint}
        {draft.trim() && normalizeTag(draft) !== draft.trim() && normalizeTag(draft) && (
          <> · {t("tags.willBe", { tag: normalizeTag(draft) })}</>
        )}
      </p>
    </div>
  )
}

/** Read-only chips; each links to the monitor list filtered by that tag. */
export function TagChips({ tags, linked = false }: { tags: readonly string[]; linked?: boolean }) {
  if (tags.length === 0) return null
  const chip = "rounded-full bg-raised px-2 py-px text-[11px] font-medium text-dim"
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {tags.map((tag) =>
        linked ? (
          <Link
            key={tag}
            to={`/monitors?tag=${encodeURIComponent(tag)}`}
            className={`${chip} hover:text-ink hover:underline`}
          >
            {tag}
          </Link>
        ) : (
          <span key={tag} className={chip}>
            {tag}
          </span>
        ),
      )}
    </span>
  )
}
