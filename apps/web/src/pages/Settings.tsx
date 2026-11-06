import type { Locale } from "@cronko/shared/translations"
import {
  ChevronDown,
  Clock,
  History,
  Search,
  Settings,
  Shield,
  Smile,
  Trash2,
  Zap,
} from "lucide-react"
import { useEffect, useState } from "react"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { useTheme } from "@/components/shared/ThemeProvider"
import { useToast } from "@/components/shared/Toast"
import { Toggle } from "@/components/shared/Toggle"
import { api } from "@/lib/api"
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
}

function formatSecondsReadable(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}min`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

function formatMsReadable(ms: number): string {
  return formatSecondsReadable(ms)
}

function Section({
  icon: Icon,
  title,
  children,
  danger,
  defaultOpen = true,
  searchQuery = "",
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
  danger?: boolean
  defaultOpen?: boolean
  searchQuery?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  const isOpen = searchQuery ? true : open

  return (
    <div
      className={`rounded-xl border shadow-sm transition-colors ${
        danger
          ? "border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10"
          : "border-[#e8eaed] dark:border-zinc-800/80 bg-white dark:bg-zinc-900"
      }`}
    >
      <button
        type="button"
        onClick={() => (searchQuery ? null : setOpen(!open))}
        className={`w-full border-b px-5 py-3 flex items-center gap-2 text-left ${
          danger
            ? "border-red-200 dark:border-red-800/50"
            : "border-[#e8eaed] dark:border-zinc-800/80"
        }`}
      >
        <Icon
          className={`h-4 w-4 shrink-0 ${danger ? "text-red-500 dark:text-red-400" : "text-[#697386]"}`}
        />
        <h2
          className={`text-xs uppercase tracking-wider font-medium flex-1 ${
            danger ? "text-red-600 dark:text-red-400" : "text-[#697386] dark:text-zinc-500"
          }`}
        >
          {title}
        </h2>
        {!searchQuery && (
          <ChevronDown
            className={`h-3.5 w-3.5 text-[#8e99a8] transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
          />
        )}
      </button>
      {isOpen && <div className="p-5 space-y-4">{children}</div>}
    </div>
  )
}

function Field({
  label,
  hint,
  humanLabel,
  children,
}: {
  label?: string
  hint?: string
  humanLabel?: string
  children: React.ReactNode
}) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-[#697386] dark:text-zinc-500 mb-1.5">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1">{children}</div>
        {humanLabel && (
          <span className="text-[10px] text-[#8e99a8] dark:text-zinc-500 tabular-nums shrink-0">
            {humanLabel}
          </span>
        )}
      </div>
      {hint && (
        <p className="text-[10px] text-[#8e99a8] dark:text-zinc-500 mt-1 leading-relaxed">{hint}</p>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { t, locale, setLocale } = useT()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const [settings, setSettings] = useState<SettingsData>(DEFAULTS)
  const [emoji, setEmoji] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    api.settings
      .get()
      .then((data) => {
        setSettings(data)
        setEmoji(localStorage.getItem("cronko_favicon") ?? "")
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error("Failed to load settings:", e)
      })
      .finally(() => setLoading(false))
  }, [])

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

  const update = (key: keyof SettingsData, value: string | number) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      await api.settings.update(settings)
      toast(t("settings.saved"), "success")
    } catch {
      setError(t("settings.failedSave"))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setResetOpen(false)
    setSaving(true)
    try {
      await api.settings.update(DEFAULTS)
      setSettings(DEFAULTS)
      toast(t("settings.saved"), "success")
    } catch {
      setError(t("settings.failedReset"))
    } finally {
      setSaving(false)
    }
  }

  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("cronko_compact") === "true"
    setCompact(stored)
  }, [])

  useEffect(() => {
    const handler = () => {
      const stored = localStorage.getItem("cronko_compact") === "true"
      setCompact(stored)
    }
    window.addEventListener("compactchange", handler)
    return () => window.removeEventListener("compactchange", handler)
  }, [])

  const toggleCompact = (checked: boolean) => {
    setCompact(checked)
    localStorage.setItem("cronko_compact", String(checked))
    document.documentElement.classList.toggle("compact", checked)
    window.dispatchEvent(new Event("compactchange"))
  }

  const inputClass =
    "w-full rounded-lg border border-[#dde0e4] dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-[#1a1f36] dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/40 focus:border-[#5e6ad2]/40 transition-colors shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none"

  const q = searchQuery.toLowerCase()

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-[#697386]" />
          <h1 className="text-lg font-semibold text-[#1a1f36] dark:text-zinc-100">
            {t("settings.title")}
          </h1>
        </div>
        {/* Search Bar — Raycast style */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8e99a8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("common.search")}
            className="w-full rounded-lg border border-[#dde0e4] dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-8 pr-3 py-2 text-sm text-[#1a1f36] dark:text-zinc-100 placeholder:text-[#8e99a8] focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/40 transition-colors shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Two-column grid for compact sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section icon={Smile} title={t("settings.instance")} searchQuery={q}>
          <Field label={t("settings.instanceName")}>
            <input
              type="text"
              value={settings.instanceName}
              onChange={(e) => update("instanceName", e.target.value)}
              disabled={loading}
              className={inputClass}
            />
          </Field>
          <Field label={t("settings.faviconEmoji")}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                placeholder="⏰"
                disabled={loading}
                className={`w-20 text-center ${inputClass}`}
              />
              {emoji && <span className="text-xl">{emoji}</span>}
            </div>
          </Field>
          <Field label={t("settings.timezone")}>
            <select
              value={settings.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              disabled={loading}
              className={inputClass}
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
              disabled={loading}
              className={inputClass}
            >
              <option value="pt-BR">🇧🇷 Português</option>
              <option value="en-US">🇺🇸 English</option>
            </select>
          </Field>
          <Field label={t("ui.theme")}>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as "dark" | "light" | "system")}
              disabled={loading}
              className={inputClass}
            >
              <option value="dark">{t("ui.themeDark")}</option>
              <option value="light">{t("ui.themeLight")}</option>
              <option value="system">{t("ui.themeSystem")}</option>
            </select>
          </Field>
          <Field>
            <Toggle
              label={t("settings.compactMode")}
              checked={compact}
              onChange={toggleCompact}
              hint={t("settings.compactModeHint")}
            />
          </Field>
        </Section>

        <Section icon={Zap} title={t("settings.scheduler")} searchQuery={q}>
          <Field
            label={t("settings.schedulerTick")}
            hint={t("settings.schedulerTickHint")}
            humanLabel={`≈ ${formatMsReadable(settings.schedulerTickMs)}`}
          >
            <input
              type="number"
              value={settings.schedulerTickMs}
              onChange={(e) => update("schedulerTickMs", parseInt(e.target.value) || 10000)}
              disabled={loading}
              className={inputClass}
              min={1000}
              max={120000}
            />
          </Field>
        </Section>

        <Section icon={Clock} title={t("settings.defaultValues")} searchQuery={q}>
          <Field
            label={t("settings.defaultInterval")}
            hint={t("settings.defaultIntervalHint")}
            humanLabel={`≈ ${formatSecondsReadable(settings.defaultIntervalSeconds * 1000)}`}
          >
            <input
              type="number"
              value={settings.defaultIntervalSeconds}
              onChange={(e) => update("defaultIntervalSeconds", parseInt(e.target.value) || 86400)}
              disabled={loading}
              className={inputClass}
              min={10}
            />
          </Field>
          <Field
            label={t("settings.defaultGracePeriod")}
            hint={t("settings.defaultGracePeriodHint")}
            humanLabel={`≈ ${formatSecondsReadable(settings.defaultGracePeriodSeconds * 1000)}`}
          >
            <input
              type="number"
              value={settings.defaultGracePeriodSeconds}
              onChange={(e) => update("defaultGracePeriodSeconds", parseInt(e.target.value) || 120)}
              disabled={loading}
              className={inputClass}
              min={0}
            />
          </Field>
        </Section>

        <Section icon={Shield} title={t("settings.rateLimit")} searchQuery={q}>
          <Field label={t("settings.pingRateLimit")} hint={t("settings.pingRateLimitHint")}>
            <input
              type="number"
              value={settings.pingRateLimitPerMinute}
              onChange={(e) => update("pingRateLimitPerMinute", parseInt(e.target.value) || 60)}
              disabled={loading}
              className={inputClass}
              min={1}
              max={600}
            />
          </Field>
          <Field label={t("settings.maxHeartbeats")} hint={t("settings.maxHeartbeatsHint")}>
            <input
              type="number"
              value={settings.maxHeartbeatsPerMonitor}
              onChange={(e) => update("maxHeartbeatsPerMonitor", parseInt(e.target.value) || 500)}
              disabled={loading}
              className={inputClass}
              min={10}
              max={10000}
            />
          </Field>
        </Section>

        <Section icon={History} title={t("settings.history")} searchQuery={q}>
          <Field
            label={t("settings.heartbeatHistory")}
            hint={t("settings.heartbeatHistoryHint")}
            humanLabel={`≈ ${Math.round(settings.heartbeatHistoryDays / 30)} month${settings.heartbeatHistoryDays >= 60 ? "s" : ""}`}
          >
            <input
              type="number"
              value={settings.heartbeatHistoryDays}
              onChange={(e) => update("heartbeatHistoryDays", parseInt(e.target.value) || 90)}
              disabled={loading}
              className={inputClass}
              min={1}
              max={365}
            />
          </Field>
        </Section>
      </div>

      {/* Danger Zone */}
      <Section icon={Trash2} title={t("settings.dangerZone")} danger searchQuery={q}>
        <p className="text-xs text-[#697386] dark:text-zinc-400">{t("settings.dangerZoneDesc")}</p>
        <button
          onClick={() => setResetOpen(true)}
          className="inline-flex items-center rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 px-4 py-2 text-sm font-medium transition-colors"
        >
          {t("settings.resetDefaults")}
        </button>
      </Section>

      <ConfirmModal
        open={resetOpen}
        onCancel={() => setResetOpen(false)}
        title={t("settings.resetTitle")}
        message={t("settings.resetMessage")}
        confirmLabel={t("common.reset")}
        variant="danger"
        onConfirm={handleReset}
      />

      {/* Sticky Save Bar */}
      <div className="sticky bottom-0 z-10 mx-0 flex justify-end py-3 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-sm border-t border-[#e8eaed] dark:border-zinc-800">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors"
        >
          {saving ? t("settings.saving") : t("settings.saveSettings")}
        </button>
      </div>
    </div>
  )
}
