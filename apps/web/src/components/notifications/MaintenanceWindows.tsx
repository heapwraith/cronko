import { parseWeeklySchedule, weeklySchedule } from "@cronko/shared/maintenance"
import { tagCounts } from "@cronko/shared/tags"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Trash2, Wrench } from "lucide-react"
import { useId, useState } from "react"
import { Button } from "@/components/shared/Button"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { IconButton } from "@/components/shared/IconButton"
import { useToast } from "@/components/shared/Toast"
import { Toggle } from "@/components/shared/Toggle"
import { api, type MaintenanceInput, type MaintenanceWindowView } from "@/lib/api"
import { useT } from "@/lib/i18n"

const field =
  "min-h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink focus-visible:outline-2"
const label = "mb-1.5 block text-sm font-semibold"
const DURATIONS = [30, 60, 120, 240, 480, 720, 1440]
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday first

function dayNames(locale: string): string[] {
  // 2026-11-01 is a Sunday: index i is weekday i, as in cron.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 10, 1 + i, 12)).toLocaleDateString(locale, {
      weekday: "short",
      timeZone: "UTC",
    }),
  )
}

function durationLabel(min: number, t: ReturnType<typeof useT>["t"]): string {
  if (min % 60 === 0) return t("maint.hours", { n: String(min / 60) })
  return t("maint.minutes", { n: String(min) })
}

type Draft = {
  name: string
  days: number[]
  time: string
  durationMinutes: number
  timezone: string
  target: MaintenanceInput["target"]
  targetValue: string
  enabled: boolean
}

function toDraft(w?: MaintenanceWindowView): Draft {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  if (!w) {
    return {
      name: "",
      days: [0],
      time: "02:00",
      durationMinutes: 120,
      timezone: tz,
      target: "all",
      targetValue: "",
      enabled: true,
    }
  }
  const p = parseWeeklySchedule(w.schedule)
  return {
    name: w.name,
    days: p?.days ?? [0],
    time: p ? `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` : "02:00",
    durationMinutes: w.durationMinutes,
    timezone: w.timezone,
    target: w.target,
    targetValue: w.targetValue ?? "",
    enabled: w.enabled,
  }
}

function WindowForm({
  initial,
  onDone,
}: {
  initial?: MaintenanceWindowView
  onDone: (saved: boolean) => void
}) {
  const { t, locale } = useT()
  const { toast } = useToast()
  const id = useId()
  const [d, setD] = useState<Draft>(() => toDraft(initial))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { data: monitors = [] } = useQuery({
    queryKey: ["monitors"],
    queryFn: () => api.monitors.list(),
  })
  const tags = tagCounts(monitors)
  const names = dayNames(locale)
  // A schedule this form did not write (e.g. via the API) is kept unless edited.
  const custom = initial && !parseWeeklySchedule(initial.schedule) ? initial.schedule : null
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!d.name.trim() || (!custom && d.days.length === 0)) {
      setError(!d.name.trim() ? t("notifications.err.required") : t("maint.pickDay"))
      return
    }
    const [hh = "0", mm = "0"] = d.time.split(":")
    const body: MaintenanceInput = {
      name: d.name.trim(),
      schedule: custom ?? weeklySchedule(d.days, Number(hh), Number(mm)),
      timezone: d.timezone,
      durationMinutes: d.durationMinutes,
      target: d.target,
      targetValue: d.target === "all" ? null : d.targetValue,
      enabled: d.enabled,
    }
    setSaving(true)
    setError(null)
    try {
      if (initial) await api.maintenance.update(initial.id, body)
      else await api.maintenance.create(body)
      toast(t(initial ? "maint.saved" : "maint.created"), "success")
      onDone(true)
    } catch {
      setError(t("maint.failed"))
    } finally {
      setSaving(false)
    }
  }

  // Every IANA zone the browser knows; the current value is kept even if missing.
  const timezones = [...new Set([d.timezone, "UTC", ...Intl.supportedValuesOf("timeZone")])]

  return (
    <form
      onSubmit={save}
      noValidate
      className="space-y-4 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className={label}>
            {t("maint.name")}
          </label>
          <input
            id={`${id}-name`}
            value={d.name}
            maxLength={80}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Backup semanal"
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-tz`} className={label}>
            {t("maint.timezone")}
          </label>
          <select
            id={`${id}-tz`}
            value={d.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            className={field}
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      {custom ? (
        <p className="font-mono text-sm text-dim">
          {t("maint.customSchedule", { schedule: custom })}
        </p>
      ) : (
        <fieldset className="m-0 border-0 p-0">
          <legend className={label}>{t("maint.days")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAY_ORDER.map((day) => {
              const on = d.days.includes(day)
              return (
                <label
                  key={day}
                  className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium capitalize has-[:focus-visible]:outline-2 ${
                    on ? "border-signal bg-signal text-signal-fg" : "border-line-strong text-dim"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() =>
                      set("days", on ? d.days.filter((x) => x !== day) : [...d.days, day])
                    }
                  />
                  {names[day]?.replace(".", "")}
                </label>
              )
            })}
            <Button variant="ghost" size="sm" onClick={() => set("days", [0, 1, 2, 3, 4, 5, 6])}>
              {t("maint.everyDay")}
            </Button>
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-time`} className={label}>
            {t("maint.start")}
          </label>
          <input
            id={`${id}-time`}
            type="time"
            value={d.time}
            disabled={!!custom}
            onChange={(e) => set("time", e.target.value)}
            className={`${field} font-mono`}
          />
        </div>
        <div>
          <label htmlFor={`${id}-dur`} className={label}>
            {t("maint.duration")}
          </label>
          <select
            id={`${id}-dur`}
            value={d.durationMinutes}
            onChange={(e) => set("durationMinutes", Number(e.target.value))}
            className={field}
          >
            {[...new Set([...DURATIONS, d.durationMinutes])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {durationLabel(m, t)}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-target`} className={label}>
            {t("maint.target")}
          </label>
          <select
            id={`${id}-target`}
            value={d.target}
            onChange={(e) => {
              set("target", e.target.value as Draft["target"])
              set("targetValue", "")
            }}
            className={field}
          >
            <option value="all">{t("maint.target.all")}</option>
            <option value="tag" disabled={tags.length === 0}>
              {t("maint.target.tag")}
            </option>
            <option value="monitor">{t("maint.target.monitor")}</option>
          </select>
        </div>
      </div>

      {d.target !== "all" && (
        <div className="sm:max-w-sm">
          <label htmlFor={`${id}-value`} className={label}>
            {d.target === "tag" ? t("maint.pickTag") : t("maint.pickMonitor")}
          </label>
          <select
            id={`${id}-value`}
            value={d.targetValue}
            onChange={(e) => set("targetValue", e.target.value)}
            className={field}
          >
            <option value="" disabled>
              —
            </option>
            {d.target === "tag"
              ? tags.map((x) => (
                  <option key={x.tag} value={x.tag}>
                    {x.tag} ({x.count})
                  </option>
                ))
              : monitors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
          </select>
        </div>
      )}

      <Toggle label={t("maint.enabled")} checked={d.enabled} onChange={(v) => set("enabled", v)} />

      {error && (
        <p role="alert" className="text-sm font-medium text-down">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving || (d.target !== "all" && !d.targetValue)}>
          {initial ? t("maint.save") : t("maint.create")}
        </Button>
        <Button variant="ghost" onClick={() => onDone(false)} disabled={saving}>
          {t("monitors.cancel")}
        </Button>
      </div>
    </form>
  )
}

export function MaintenanceWindows() {
  const { t, locale } = useT()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: windows = [] } = useQuery({
    queryKey: ["maintenance"],
    queryFn: () => api.maintenance.list(),
    refetchInterval: 60_000,
  })
  const { data: monitors = [] } = useQuery({
    queryKey: ["monitors"],
    queryFn: () => api.monitors.list(),
  })
  const [editing, setEditing] = useState<MaintenanceWindowView | "new" | null>(null)
  const [deleting, setDeleting] = useState<MaintenanceWindowView | null>(null)
  const names = dayNames(locale)
  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  const refresh = () => qc.invalidateQueries({ queryKey: ["maintenance"] })

  function summary(w: MaintenanceWindowView): string {
    const p = parseWeeklySchedule(w.schedule)
    const scope =
      w.target === "all"
        ? t("maint.target.all")
        : w.target === "tag"
          ? `tag ${w.targetValue}`
          : (monitors.find((m) => m.id === w.targetValue)?.name ?? "—")
    if (!p) return `${w.schedule} · ${durationLabel(w.durationMinutes, t)} · ${scope}`
    const days =
      p.days.length === 7
        ? t("maint.everyDay")
        : DAY_ORDER.filter((x) => p.days.includes(x))
            .map((x) => names[x]?.replace(".", ""))
            .join(", ")
    const hhmm = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`
    return `${days} · ${hhmm} (${w.timezone}) · ${durationLabel(w.durationMinutes, t)} · ${scope}`
  }

  return (
    <section aria-labelledby="maint-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="maint-title" className="text-lg">
            {t("maint.title")}
          </h2>
          <p className="mt-1 text-sm text-dim">{t("maint.intro")}</p>
        </div>
        {editing === null && (
          <Button variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("maint.new")}
          </Button>
        )}
      </div>

      {editing !== null && (
        <WindowForm
          key={editing === "new" ? "new" : editing.id}
          {...(editing !== "new" && { initial: editing })}
          onDone={async (saved) => {
            setEditing(null)
            if (saved) await refresh()
          }}
        />
      )}

      {windows.length === 0 ? (
        editing === null && <p className="text-sm text-dim">{t("maint.empty")}</p>
      ) : (
        <ul className="rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
          {windows.map((w) => (
            <li
              key={w.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-b-0"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Wrench className="h-4 w-4 text-dim" aria-hidden="true" />
                  <span className="font-semibold text-ink">{w.name}</span>
                  {w.enabled && w.activeUntil ? (
                    <span className="rounded-full bg-[var(--chip-missed-bg)] px-2 py-0.5 text-xs font-medium text-[var(--chip-missed-fg)]">
                      {t("maint.runningUntil", { time: when(w.activeUntil) })}
                    </span>
                  ) : w.enabled && w.nextStart ? (
                    <span className="text-xs text-dim">
                      {t("maint.next", { time: when(w.nextStart) })}
                    </span>
                  ) : (
                    <span className="rounded-full bg-[var(--chip-paused-bg)] px-2 py-0.5 text-xs font-medium text-[var(--chip-paused-fg)]">
                      {t("maint.off")}
                    </span>
                  )}
                </div>
                <p className="text-sm text-dim">{summary(w)}</p>
              </div>
              <div className="flex items-center gap-1">
                <IconButton label={`${t("monitors.edit")} ${w.name}`} onClick={() => setEditing(w)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={`${t("monitors.delete")} ${w.name}`}
                  onClick={() => setDeleting(w)}
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
        title={t("maint.deleteTitle")}
        message={t("maint.deleteMessage", { name: deleting?.name ?? "" })}
        confirmLabel={t("monitors.delete")}
        variant="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api.maintenance.delete(deleting.id)
            toast(t("maint.deleted"), "success")
            await refresh()
          } catch {
            toast(t("maint.failed"), "error")
          } finally {
            setDeleting(null)
          }
        }}
      />
    </section>
  )
}
