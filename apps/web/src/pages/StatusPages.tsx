import { STATUS_SLUG_PATTERN } from "@cronko/shared/status"
import { normalizeTag, tagCounts } from "@cronko/shared/tags"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ExternalLink, Globe, Pencil, Plus, Trash2 } from "lucide-react"
import { useId, useState } from "react"
import { Button } from "@/components/shared/Button"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { EmptyState } from "@/components/shared/EmptyState"
import { IconButton } from "@/components/shared/IconButton"
import { useToast } from "@/components/shared/Toast"
import { Toggle } from "@/components/shared/Toggle"
import { ApiError, api, type StatusPageAdmin, type StatusPageInput } from "@/lib/api"
import { useT } from "@/lib/i18n"

const field =
  "min-h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink placeholder:text-dim focus-visible:outline-2"
const label = "mb-1.5 block text-sm font-semibold"
const hint = "mt-1 text-xs text-dim"

/** "Acme Prod Jobs!" -> "acme-prod-jobs" */
function slugify(title: string): string {
  return normalizeTag(title)
    .replace(/[._]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "")
    .slice(0, 48)
}

type Draft = { title: string; slug: string; tag: string; description: string; enabled: boolean }
const EMPTY: Draft = { title: "", slug: "", tag: "", description: "", enabled: false }

function PageForm({
  initial,
  tags,
  onSaved,
  onCancel,
}: {
  initial?: StatusPageAdmin
  tags: { tag: string; count: number }[]
  onSaved: () => void
  onCancel: () => void
}) {
  const { t } = useT()
  const { toast } = useToast()
  const ids = { title: useId(), slug: useId(), tag: useId(), desc: useId(), tags: useId() }
  const [draft, setDraft] = useState<Draft>(
    initial
      ? { ...initial, description: initial.description ?? "" }
      : { ...EMPTY, tag: tags[0]?.tag ?? "" },
  )
  // Follow the title until the user edits the address themselves.
  const [slugTouched, setSlugTouched] = useState(!!initial)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const url = `${window.location.origin}/status/${draft.slug || "…"}`
  const tagCount = tags.find((x) => x.tag === normalizeTag(draft.tag))?.count ?? 0

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!draft.title.trim()) next.title = t("notifications.err.required")
    if (!STATUS_SLUG_PATTERN.test(draft.slug)) next.slug = t("status.slugInvalid")
    if (!normalizeTag(draft.tag)) next.tag = t("notifications.err.required")
    setErrors(next)
    if (Object.keys(next).length) return

    const body: StatusPageInput = {
      title: draft.title.trim(),
      slug: draft.slug,
      tag: draft.tag,
      description: draft.description.trim() || null,
      enabled: draft.enabled,
    }
    setSaving(true)
    try {
      if (initial) await api.statusPages.update(initial.id, body)
      else await api.statusPages.create(body)
      toast(t(initial ? "status.saved" : "status.created"), "success")
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ slug: t("status.slugTaken") })
      else toast(t("status.failed"), "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={save}
      noValidate
      className="space-y-4 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.title} className={label}>
            {t("status.field.title")}
          </label>
          <input
            id={ids.title}
            value={draft.title}
            maxLength={80}
            onChange={(e) => {
              set("title", e.target.value)
              if (!slugTouched) set("slug", slugify(e.target.value))
            }}
            placeholder="Acme — jobs"
            aria-invalid={!!errors.title}
            className={field}
          />
          {errors.title && <p className="mt-1 text-xs font-medium text-down">{errors.title}</p>}
        </div>
        <div>
          <label htmlFor={ids.slug} className={label}>
            {t("status.field.slug")}
          </label>
          <input
            id={ids.slug}
            value={draft.slug}
            maxLength={48}
            onChange={(e) => {
              setSlugTouched(true)
              set("slug", e.target.value.toLowerCase())
            }}
            aria-invalid={!!errors.slug}
            aria-describedby={`${ids.slug}-hint`}
            className={`${field} font-mono`}
          />
          <p
            id={`${ids.slug}-hint`}
            className={errors.slug ? "mt-1 text-xs font-medium text-down" : hint}
          >
            {errors.slug ?? t("status.field.slugHint", { url })}
          </p>
        </div>
        <div>
          <label htmlFor={ids.tag} className={label}>
            {t("status.field.tag")}
          </label>
          <input
            id={ids.tag}
            value={draft.tag}
            list={ids.tags}
            onChange={(e) => set("tag", e.target.value)}
            aria-invalid={!!errors.tag}
            aria-describedby={`${ids.tag}-hint`}
            className={`${field} font-mono`}
          />
          <datalist id={ids.tags}>
            {tags.map((x) => (
              <option key={x.tag} value={x.tag} />
            ))}
          </datalist>
          <p
            id={`${ids.tag}-hint`}
            className={errors.tag ? "mt-1 text-xs font-medium text-down" : hint}
          >
            {errors.tag ??
              `${t("status.field.tagHint")} ${t("status.monitorsWithTag", { count: String(tagCount) })}.`}
          </p>
        </div>
        <div>
          <label htmlFor={ids.desc} className={label}>
            {t("status.field.description")}
          </label>
          <input
            id={ids.desc}
            value={draft.description}
            maxLength={280}
            onChange={(e) => set("description", e.target.value)}
            className={field}
          />
        </div>
      </div>
      <Toggle
        label={t("status.field.enabled")}
        hint={t("status.field.enabledHint")}
        checked={draft.enabled}
        onChange={(v) => set("enabled", v)}
      />
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {initial ? t("status.save") : t("status.create")}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          {t("monitors.cancel")}
        </Button>
      </div>
    </form>
  )
}

export default function StatusPagesPage() {
  const { t } = useT()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: pages = [], isPending } = useQuery({
    queryKey: ["status-pages"],
    queryFn: () => api.statusPages.list(),
  })
  const { data: monitors = [] } = useQuery({
    queryKey: ["monitors"],
    queryFn: () => api.monitors.list(),
  })
  const tags = tagCounts(monitors)
  const [editing, setEditing] = useState<StatusPageAdmin | "new" | null>(null)
  const [deleting, setDeleting] = useState<StatusPageAdmin | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ["status-pages"] })

  async function toggle(p: StatusPageAdmin) {
    try {
      await api.statusPages.update(p.id, { enabled: !p.enabled })
      await refresh()
    } catch {
      toast(t("status.failed"), "error")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl leading-tight">{t("status.title")}</h1>
          <p className="mt-2 text-sm text-dim">{t("status.intro")}</p>
        </div>
        {editing === null && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("status.new")}
          </Button>
        )}
      </div>

      {editing !== null && (
        <PageForm
          key={editing === "new" ? "new" : editing.id}
          {...(editing !== "new" && { initial: editing })}
          tags={tags}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      )}

      {isPending ? null : pages.length === 0 ? (
        editing === null && (
          <EmptyState icon={Globe} title={t("status.empty")} description={t("status.emptyHint")} />
        )
      ) : (
        <ul className="rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
          {pages.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-b-0"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{p.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.enabled
                        ? "bg-[var(--chip-healthy-bg)] text-[var(--chip-healthy-fg)]"
                        : "bg-[var(--chip-paused-bg)] text-[var(--chip-paused-fg)]"
                    }`}
                  >
                    {p.enabled ? t("status.published") : t("status.draft")}
                  </span>
                </div>
                <p className="font-mono text-xs text-dim">
                  /status/{p.slug} · tag {p.tag} ·{" "}
                  {t("status.monitorsWithTag", {
                    count: String(tags.find((x) => x.tag === p.tag)?.count ?? 0),
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Toggle
                  label={t("status.field.enabled")}
                  hideLabel
                  checked={p.enabled}
                  onChange={() => toggle(p)}
                />
                {p.enabled && (
                  <Button
                    variant="secondary"
                    size="sm"
                    href={`/status/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("status.open")}
                  </Button>
                )}
                <IconButton
                  label={`${t("monitors.edit")} ${p.title}`}
                  onClick={() => setEditing(p)}
                >
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={`${t("monitors.delete")} ${p.title}`}
                  onClick={() => setDeleting(p)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={deleting !== null}
        title={t("status.deleteTitle")}
        message={t("status.deleteMessage", { title: deleting?.title ?? "" })}
        confirmLabel={t("monitors.delete")}
        variant="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api.statusPages.delete(deleting.id)
            toast(t("status.deleted"), "success")
            await refresh()
          } catch {
            toast(t("status.failed"), "error")
          } finally {
            setDeleting(null)
          }
        }}
      />
    </div>
  )
}
