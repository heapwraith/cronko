import type { DigestFrequency } from "@cronko/shared/digest"
import type { Locale } from "@cronko/shared/translations"
import { formatDuration } from "@cronko/shared/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { cloneElement, type ReactElement, useEffect, useId, useState } from "react"
import { ApiTokens } from "@/components/settings/ApiTokens"
import { Button } from "@/components/shared/Button"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { Skeleton } from "@/components/shared/Skeleton"
import { useTheme } from "@/components/shared/ThemeProvider"
import { useToast } from "@/components/shared/Toast"
import { Toggle } from "@/components/shared/Toggle"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"

type SettingsData = {
  instanceName: string
  timezone: string
  schedulerTickMs: number
  defaultGracePeriodSeconds: number
  defaultIntervalSeconds: number
  pingRateLimitPerMinute: number
  maxHeartbeatsPerMonitor: number
  heartbeatHistoryDays: number
  digestFrequency: DigestFrequency
  digestHour: number
}

const DEFAULTS: SettingsData = {
  instanceName: "Cronko",
  timezone: "UTC",
  schedulerTickMs: 10000,
  defaultGracePeriodSeconds: 120,
  defaultIntervalSeconds: 86400,
  pingRateLimitPerMinute: 60,
  maxHeartbeatsPerMonitor: 500,
  heartbeatHistoryDays: 90,
  digestFrequency: "off",
  digestHour: 9,
}

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)

const control =
  "min-h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink placeholder:text-dim focus-visible:outline-2 disabled:opacity-50"

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** Label, control, optional hint and a computed readout, wired for assistive tech. */
function Field({
  label,
  hint,
  readout,
  children,
}: {
  label: string
  hint?: string
  readout?: string
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>
}) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-medium"
      >
        {label}
        {readout && <span className="font-mono text-xs font-normal text-dim tnum">{readout}</span>}
      </label>
      {cloneElement(children, hint ? { id, "aria-describedby": hintId } : { id })}
      {hint && (
        <p id={hintId} className="mt-1 text-xs leading-relaxed text-dim">
          {hint}
        </p>
      )}
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  fallback,
  ...rest
}: {
  value: number
  onChange: (n: number) => void
  fallback: number
  min?: number
  max?: number
  disabled?: boolean
  id?: string
  "aria-describedby"?: string
}) {
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || fallback)}
      className={`${control} font-mono tnum`}
    />
  )
}

export default function SettingsPage() {
  const { t, locale, setLocale } = useT()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data, isPending } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
  })
  const [settings, setSettings] = useState<SettingsData>(DEFAULTS)
  const [emoji, setEmoji] = useState(() => localStorage.getItem("cronko_favicon") ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [compact, setCompact] = useState(() => localStorage.getItem("cronko_compact") === "true")
  const [sendingDigest, setSendingDigest] = useState(false)

  useEffect(() => {
    if (data) setSettings(data)
  }, [data])

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel=icon]")
    if (emoji) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="28" font-size="28">${emoji}</text></svg>`
      const href = `data:image/svg+xml,${encodeURIComponent(svg)}`
      if (link) link.href = href
      else {
        const el = document.createElement("link")
        el.rel = "icon"
        el.href = href
        document.head.appendChild(el)
      }
    } else if (link) link.remove()
    localStorage.setItem("cronko_favicon", emoji)
  }, [emoji])

  // The top bar can flip density too; stay in sync with it.
  useEffect(() => {
    const sync = () => setCompact(localStorage.getItem("cronko_compact") === "true")
    window.addEventListener("compactchange", sync)
    return () => window.removeEventListener("compactchange", sync)
  }, [])

  const set = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  async function persist(next: SettingsData, failMsg: string) {
    setError(null)
    setSaving(true)
    try {
      await api.settings.update(next)
      setSettings(next)
      await qc.invalidateQueries({ queryKey: ["settings"] })
      toast(t("settings.saved"), "success")
    } catch {
      setError(failMsg)
    } finally {
      setSaving(false)
    }
  }

  const toggleCompact = (checked: boolean) => {
    setCompact(checked)
    localStorage.setItem("cronko_compact", String(checked))
    document.documentElement.classList.toggle("compact", checked)
    window.dispatchEvent(new Event("compactchange"))
  }

  async function sendTestDigest() {
    setSendingDigest(true)
    try {
      await api.settings.sendTestDigest()
      toast(t("settings.digestTestSent"), "success")
    } catch (err) {
      toast(
        err instanceof ApiError && err.status === 400
          ? t("settings.digestNoChannel")
          : t("settings.digestTestFailed"),
        "error",
      )
    } finally {
      setSendingDigest(false)
    }
  }

  const off = isPending
  const seconds = (s: number) => `≈ ${formatDuration(s * 1000)}`

  return (
    <form
      className="max-w-5xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        void persist(settings, t("settings.failedSave"))
      }}
    >
      <h1 className="text-2xl leading-tight">{t("settings.title")}</h1>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-[var(--chip-down-bg)] px-3 py-2 text-sm font-medium text-[var(--chip-down-fg)]"
        >
          {error}
        </p>
      )}

      {isPending ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Group title={t("settings.instance")}>
            <Field label={t("settings.instanceName")}>
              <input
                type="text"
                value={settings.instanceName}
                onChange={(e) => set("instanceName", e.target.value)}
                className={control}
              />
            </Field>
            <Field label={t("settings.timezone")}>
              <select
                value={settings.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                className={control}
              >
                <option value="UTC">UTC</option>
                <option value="America/Sao_Paulo">America/São Paulo</option>
                <option value="America/New_York">America/New York</option>
                <option value="Europe/London">Europe/London</option>
              </select>
            </Field>
            <Field label={t("settings.language")}>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
                className={control}
              >
                <option value="pt-BR">Português</option>
                <option value="en-US">English</option>
              </select>
            </Field>
            <Field label={t("ui.theme")}>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as "dark" | "light" | "system")}
                className={control}
              >
                <option value="dark">{t("ui.themeDark")}</option>
                <option value="light">{t("ui.themeLight")}</option>
                <option value="system">{t("ui.themeSystem")}</option>
              </select>
            </Field>
            <Field label={t("settings.faviconEmoji")}>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                placeholder="⏰"
                className={`${control} w-24! text-center`}
              />
            </Field>
            <Toggle
              label={t("settings.compactMode")}
              checked={compact}
              onChange={toggleCompact}
              hint={t("settings.compactModeHint")}
            />
          </Group>

          <div className="space-y-5">
            <Group title={t("settings.defaultValues")}>
              <Field
                label={t("settings.defaultInterval")}
                hint={t("settings.defaultIntervalHint")}
                readout={seconds(settings.defaultIntervalSeconds)}
              >
                <NumberInput
                  value={settings.defaultIntervalSeconds}
                  onChange={(n) => set("defaultIntervalSeconds", n)}
                  fallback={86400}
                  min={10}
                  disabled={off}
                />
              </Field>
              <Field
                label={t("settings.defaultGracePeriod")}
                hint={t("settings.defaultGracePeriodHint")}
                readout={seconds(settings.defaultGracePeriodSeconds)}
              >
                <NumberInput
                  value={settings.defaultGracePeriodSeconds}
                  onChange={(n) => set("defaultGracePeriodSeconds", n)}
                  fallback={120}
                  min={0}
                />
              </Field>
            </Group>

            <Group title={t("settings.scheduler")}>
              <Field
                label={t("settings.schedulerTick")}
                hint={t("settings.schedulerTickHint")}
                readout={`≈ ${formatDuration(settings.schedulerTickMs)}`}
              >
                <NumberInput
                  value={settings.schedulerTickMs}
                  onChange={(n) => set("schedulerTickMs", n)}
                  fallback={10000}
                  min={1000}
                  max={120000}
                />
              </Field>
            </Group>
          </div>

          <Group title={t("settings.rateLimit")}>
            <Field label={t("settings.pingRateLimit")} hint={t("settings.pingRateLimitHint")}>
              <NumberInput
                value={settings.pingRateLimitPerMinute}
                onChange={(n) => set("pingRateLimitPerMinute", n)}
                fallback={60}
                min={1}
                max={600}
              />
            </Field>
            <Field label={t("settings.maxHeartbeats")} hint={t("settings.maxHeartbeatsHint")}>
              <NumberInput
                value={settings.maxHeartbeatsPerMonitor}
                onChange={(n) => set("maxHeartbeatsPerMonitor", n)}
                fallback={500}
                min={10}
                max={10000}
              />
            </Field>
          </Group>

          <Group title={t("settings.digest")}>
            <p className="text-sm text-dim">{t("settings.digestIntro")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.digestFrequency")}>
                <select
                  value={settings.digestFrequency}
                  onChange={(e) => set("digestFrequency", e.target.value as DigestFrequency)}
                  className={control}
                >
                  <option value="off">{t("settings.digestOff")}</option>
                  <option value="daily">{t("settings.digestDaily")}</option>
                  <option value="weekly">{t("settings.digestWeekly")}</option>
                </select>
              </Field>
              <Field
                label={t("settings.digestHour")}
                hint={t("settings.digestHourHint", { tz: settings.timezone })}
              >
                <select
                  value={settings.digestHour}
                  onChange={(e) => set("digestHour", Number(e.target.value))}
                  disabled={settings.digestFrequency === "off"}
                  className={`${control} font-mono tnum`}
                >
                  {HOURS.map((label, h) => (
                    <option key={label} value={h}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={sendTestDigest}
                disabled={sendingDigest}
              >
                {t("settings.digestSendTest")}
              </Button>
              <span className="text-xs text-dim">{t("settings.digestSendTestHint")}</span>
            </div>
          </Group>

          <ApiTokens />

          <Group title={t("settings.history")}>
            <Field
              label={t("settings.heartbeatHistory")}
              hint={t("settings.heartbeatHistoryHint")}
              readout={`≈ ${formatDuration(settings.heartbeatHistoryDays * 86_400_000)}`}
            >
              <NumberInput
                value={settings.heartbeatHistoryDays}
                onChange={(n) => set("heartbeatHistoryDays", n)}
                fallback={90}
                min={1}
                max={365}
              />
            </Field>
          </Group>
        </div>
      )}

      <section className="space-y-3 rounded-xl border border-down/40 bg-panel p-5">
        <h2 className="text-base font-semibold text-down">{t("settings.dangerZone")}</h2>
        <p className="text-sm text-dim">{t("settings.dangerZoneDesc")}</p>
        <Button variant="danger" onClick={() => setResetOpen(true)} disabled={saving || isPending}>
          {t("settings.resetDefaults")}
        </Button>
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 flex justify-end border-t border-line bg-ground px-1 py-3">
        <Button type="submit" disabled={saving || isPending}>
          {saving ? t("settings.saving") : t("settings.saveSettings")}
        </Button>
      </div>

      <ConfirmModal
        open={resetOpen}
        onCancel={() => setResetOpen(false)}
        title={t("settings.resetTitle")}
        message={t("settings.resetMessage")}
        confirmLabel={t("common.reset")}
        cancelLabel={t("monitors.cancel")}
        variant="danger"
        onConfirm={() => {
          setResetOpen(false)
          void persist(DEFAULTS, t("settings.failedReset"))
        }}
      />
    </form>
  )
}
