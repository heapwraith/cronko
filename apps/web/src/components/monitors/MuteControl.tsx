import { useQueryClient } from "@tanstack/react-query"
import { Bell, BellOff } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/shared/Button"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

const OPTIONS = [
  { minutes: 60, key: "mute.1h" },
  { minutes: 8 * 60, key: "mute.8h" },
  { minutes: 24 * 60, key: "mute.24h" },
  { minutes: 7 * 24 * 60, key: "mute.7d" },
] as const

/** True while `mutedUntil` is in the future. */
export function isMuted(mutedUntil: string | null | undefined): boolean {
  return !!mutedUntil && new Date(mutedUntil).getTime() > Date.now()
}

export function formatMutedUntil(mutedUntil: string, locale: string): string {
  const until = new Date(mutedUntil)
  const sameDay = until.toDateString() === new Date().toDateString()
  return until.toLocaleString(
    locale,
    sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" },
  )
}

/** Read-only marker shown next to the status when alerts are silenced. */
export function MutedBadge({ mutedUntil }: { mutedUntil: string | null }) {
  const { t, locale } = useT()
  if (!mutedUntil || !isMuted(mutedUntil)) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[var(--chip-paused-bg)] px-2 py-0.5 text-xs font-medium text-[var(--chip-paused-fg)]"
      title={t("mute.hint")}
    >
      <BellOff className="h-3 w-3" aria-hidden="true" />
      {t("mute.until", { time: formatMutedUntil(mutedUntil, locale) })}
    </span>
  )
}

/** Mute for a fixed window, or unmute. A native select keeps it keyboard and screen-reader friendly. */
export function MuteControl({
  monitorId,
  mutedUntil,
}: {
  monitorId: string
  mutedUntil: string | null
}) {
  const { t, locale } = useT()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function apply(minutes: number | null) {
    setBusy(true)
    try {
      const res = await api.monitors.mute(monitorId, minutes)
      toast(
        res.mutedUntil
          ? t("mute.done", { time: formatMutedUntil(res.mutedUntil, locale) })
          : t("mute.undone"),
        "info",
      )
      await qc.invalidateQueries()
    } catch {
      toast(t("mute.failed"), "error")
    } finally {
      setBusy(false)
    }
  }

  if (isMuted(mutedUntil)) {
    return (
      <Button variant="secondary" size="sm" onClick={() => apply(null)} disabled={busy}>
        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
        {t("mute.unmute")}
      </Button>
    )
  }

  return (
    <label className="relative inline-flex">
      <span className="sr-only">{t("mute.label")}</span>
      <BellOff
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim"
        aria-hidden="true"
      />
      <select
        value=""
        disabled={busy}
        onChange={(e) => {
          const minutes = Number(e.target.value)
          if (minutes > 0) void apply(minutes)
        }}
        className="min-h-8 cursor-pointer appearance-none rounded-md border border-line bg-panel py-1 pl-8 pr-3 text-xs font-medium text-ink shadow-sm hover:bg-raised disabled:opacity-50"
      >
        <option value="" disabled>
          {t("mute.label")}
        </option>
        {OPTIONS.map((o) => (
          <option key={o.minutes} value={o.minutes}>
            {t(o.key)}
          </option>
        ))}
      </select>
    </label>
  )
}
