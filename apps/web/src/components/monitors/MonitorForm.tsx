import { isValidSchedule, nextRuns } from "@cronko/shared/schedule"
import { useId, useMemo, useState } from "react"
import { Button } from "@/components/shared/Button"
import { Toggle } from "@/components/shared/Toggle"
import type { MonitorInput } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { useInboundEmailDomain } from "@/lib/useInboundEmail"
import { TagInput } from "./TagInput"

type Mode = "interval" | "cron"
type Unit = "seconds" | "minutes" | "hours" | "days"

const UNIT_SECONDS: Record<Unit, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86_400 }
const UNITS: Unit[] = ["seconds", "minutes", "hours", "days"]

export interface MonitorFormValues {
  name: string
  expectedIntervalSeconds: number
  gracePeriodSeconds: number
  maxDurationMs?: number | null
  scheduleCron?: string | null
  timezone?: string | null
  alertOnAnomalies?: boolean
  tags?: string[]
  emailFailureKeywords?: string[]
}

/** Largest unit that divides the value evenly, so 7200 s reads as "2 hours". */
function toUnit(seconds: number): { amount: number; unit: Unit } {
  for (const unit of ["days", "hours", "minutes"] as const) {
    if (seconds >= UNIT_SECONDS[unit] && seconds % UNIT_SECONDS[unit] === 0) {
      return { amount: seconds / UNIT_SECONDS[unit], unit }
    }
  }
  return { amount: seconds, unit: "seconds" }
}

const PRESETS = [
  { key: "form.preset.daily", cron: "0 2 * * *" },
  { key: "form.preset.hourly", cron: "0 * * * *" },
  { key: "form.preset.weekly", cron: "0 8 * * 1" },
  { key: "form.preset.quarter", cron: "*/15 * * * *" },
] as const

const field =
  "min-h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink placeholder:text-dim disabled:opacity-50"

function allTimezones(): string[] {
  try {
    const zones = Intl.supportedValuesOf("timeZone")
    return zones.includes("UTC") ? zones : ["UTC", ...zones]
  } catch {
    return ["UTC"]
  }
}

export function MonitorForm({
  initial,
  submitLabel,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: MonitorFormValues
  submitLabel: string
  submitting: boolean
  error: string | null
  onSubmit: (input: MonitorInput) => void
  onCancel: () => void
}) {
  const { t, locale } = useT()
  const ids = {
    name: useId(),
    cron: useId(),
    tz: useId(),
    every: useId(),
    grace: useId(),
    max: useId(),
    keywords: useId(),
  }
  const inboundDomain = useInboundEmailDomain()
  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", [])
  const zones = useMemo(allTimezones, [])

  const start = toUnit(initial?.expectedIntervalSeconds ?? 3600)
  const [name, setName] = useState(initial?.name ?? "")
  const [mode, setMode] = useState<Mode>(initial?.scheduleCron ? "cron" : "interval")
  const [amount, setAmount] = useState(String(start.amount))
  const [unit, setUnit] = useState<Unit>(start.unit)
  const [cron, setCron] = useState(initial?.scheduleCron ?? "")
  const [timezone, setTimezone] = useState(initial?.timezone ?? browserTz)
  const [grace, setGrace] = useState(String(Math.round((initial?.gracePeriodSeconds ?? 120) / 60)))
  const [maxMin, setMaxMin] = useState(
    initial?.maxDurationMs ? String(Math.round(initial.maxDurationMs / 60_000)) : "",
  )
  const [anomalies, setAnomalies] = useState(initial?.alertOnAnomalies ?? false)
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [keywords, setKeywords] = useState((initial?.emailFailureKeywords ?? []).join(", "))
  const [touched, setTouched] = useState(false)

  const intervalSeconds = Math.round(Number(amount) * UNIT_SECONDS[unit])
  const intervalValid = Number.isFinite(intervalSeconds) && intervalSeconds >= 10
  const cronValid = cron.trim() !== "" && isValidSchedule(cron, timezone)
  const nameValid = name.trim() !== ""
  const scheduleValid = mode === "interval" ? intervalValid : cronValid
  const valid = nameValid && scheduleValid

  const preview = useMemo(
    () => (mode === "cron" && cronValid ? nextRuns(cron, timezone, new Date(), 3) : []),
    [mode, cron, cronValid, timezone],
  )
  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }),
    [locale, timezone],
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    const graceSeconds = Math.max(0, Math.round(Number(grace) * 60)) || 0
    const maxMs =
      maxMin.trim() === "" ? undefined : Math.max(0, Math.round(Number(maxMin) * 60_000))
    onSubmit({
      name: name.trim(),
      gracePeriodSeconds: graceSeconds,
      ...(maxMs !== undefined && { maxDurationMs: maxMs }),
      alertOnAnomalies: anomalies,
      tags,
      // Only sent when ping by e-mail is on, so a hidden field never wipes saved keywords.
      ...(inboundDomain && {
        emailFailureKeywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      }),
      ...(mode === "cron"
        ? { scheduleCron: cron.trim(), timezone }
        : {
            expectedIntervalSeconds: intervalSeconds,
            // Only an existing cron monitor needs the explicit switch back to an interval.
            ...(initial?.scheduleCron && { scheduleCron: null }),
          }),
    })
  }

  const label = "mb-1.5 block text-sm font-semibold"
  const hint = "mt-1 text-xs text-dim"

  return (
    <form onSubmit={submit} className="max-w-xl space-y-6" noValidate>
      <div>
        <label htmlFor={ids.name} className={label}>
          {t("form.name")}
        </label>
        <input
          id={ids.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-invalid={touched && !nameValid ? true : undefined}
          className={field}
        />
        <p className={hint}>
          {touched && !nameValid ? t("monitors.nameRequired") : t("form.nameHint")}
        </p>
      </div>

      <fieldset className="space-y-4">
        <legend className={label}>{t("form.schedule")}</legend>
        <div className="inline-flex rounded-md border border-line-strong bg-panel p-0.5">
          {(["interval", "cron"] as const).map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-signal ${
                mode === m ? "bg-signal text-signal-fg" : "text-dim hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="sr-only"
              />
              {m === "interval" ? t("form.modeInterval") : t("form.modeCron")}
            </label>
          ))}
        </div>

        {mode === "interval" ? (
          <div>
            <label htmlFor={ids.every} className={label}>
              {t("form.every")}
            </label>
            <div className="flex gap-2">
              <input
                id={ids.every}
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={touched && !intervalValid ? true : undefined}
                className={`${field} w-28 font-mono tnum`}
              />
              <select
                aria-label={t("form.every")}
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                className={`${field} w-40`}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`form.unit.${u}`)}
                  </option>
                ))}
              </select>
            </div>
            {touched && !intervalValid && (
              <p role="alert" className="mt-1 text-xs text-down">
                {t("form.intervalMin")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor={ids.cron} className={label}>
                {t("form.cron")}
              </label>
              <input
                id={ids.cron}
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                placeholder="0 2 * * *"
                aria-describedby={`${ids.cron}-help`}
                aria-invalid={cron.trim() !== "" && !cronValid ? true : undefined}
                className={`${field} font-mono`}
              />
              <p id={`${ids.cron}-help`} className={hint}>
                {t("form.cronHint")}
              </p>
              <fieldset className="mt-2 flex min-w-0 flex-wrap gap-2 border-0 p-0">
                <legend className="sr-only">{t("form.presets")}</legend>
                {PRESETS.map((p) => (
                  <button
                    key={p.cron}
                    type="button"
                    onClick={() => setCron(p.cron)}
                    className="rounded-md border border-line-strong bg-panel px-2.5 py-1 text-xs font-medium text-dim hover:text-ink"
                  >
                    {t(p.key)}
                  </button>
                ))}
              </fieldset>
            </div>

            <div>
              <label htmlFor={ids.tz} className={label}>
                {t("form.timezone")}
              </label>
              <select
                id={ids.tz}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className={field}
              >
                {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>

            <div aria-live="polite">
              {cron.trim() !== "" && !cronValid ? (
                <p role="alert" className="text-sm text-down">
                  {t("form.cronInvalid")}
                </p>
              ) : preview.length > 0 ? (
                <>
                  <p className="mb-1 text-sm font-semibold">{t("form.nextRuns")}</p>
                  <ul className="space-y-0.5 font-mono text-sm tnum text-dim">
                    {preview.map((d) => (
                      <li key={d.toISOString()}>{fmt.format(d)}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.grace} className={label}>
            {t("form.grace")} (min)
          </label>
          <input
            id={ids.grace}
            type="number"
            inputMode="numeric"
            min={0}
            value={grace}
            onChange={(e) => setGrace(e.target.value)}
            className={`${field} font-mono tnum`}
          />
          <p className={hint}>{t("form.graceHint")}</p>
        </div>
        <div>
          <label htmlFor={ids.max} className={label}>
            {t("form.maxDuration")}
          </label>
          <input
            id={ids.max}
            type="number"
            inputMode="numeric"
            min={0}
            value={maxMin}
            onChange={(e) => setMaxMin(e.target.value)}
            className={`${field} font-mono tnum`}
          />
          <p className={hint}>{t("form.maxDurationHint")}</p>
        </div>
      </div>

      <TagInput value={tags} onChange={setTags} label={t("tags.label")} hint={t("tags.hint")} />

      <Toggle
        label={t("form.alertOnAnomalies")}
        hint={t("form.alertOnAnomaliesHint")}
        checked={anomalies}
        onChange={setAnomalies}
      />

      {inboundDomain && (
        <div>
          <label htmlFor={ids.keywords} className={label}>
            {t("form.emailFailureKeywords")}
          </label>
          <input
            id={ids.keywords}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="error, failed, falha"
            aria-describedby={`${ids.keywords}-hint`}
            className={field}
          />
          <p id={`${ids.keywords}-hint`} className={hint}>
            {t("form.emailFailureKeywordsHint")}
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md bg-[var(--chip-down-bg)] px-3 py-2 text-sm text-[var(--chip-down-fg)]"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          {t("monitors.cancel")}
        </Button>
      </div>
    </form>
  )
}
