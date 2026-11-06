import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Read-only line with the outcome of the last scheduled backup (see BACKUP_DIR). */
export function BackupStatus() {
  const { t } = useT()
  const { data } = useQuery({ queryKey: ["backup-status"], queryFn: () => api.settings.backup() })
  if (!data) return null
  const last = data.last
  const when = last ? new Date(last.at).toLocaleString() : ""

  let line = t("settings.backupOff")
  if (data.enabled || last) {
    if (!last) line = t("settings.backupNone")
    else if (last.ok) {
      line = t("settings.backupOk", { when, size: formatBytes(last.sizeBytes ?? 0) })
    } else line = t("settings.backupFailed", { when, error: last.error ?? "" })
  }

  return (
    <section className="space-y-2 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-base font-semibold">{t("settings.backup")}</h2>
      <p className={`text-sm ${last && !last.ok ? "text-down" : "text-dim"}`}>{line}</p>
    </section>
  )
}
