import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/shared/Button"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { CopyButton } from "@/components/shared/CopyButton"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

/**
 * The instance ping key: with it a job can ping a monitor by its slug
 * (`/ping/k/<key>/<slug>`, optionally creating it with `?create=1`).
 */
export function PingKey() {
  const { t } = useT()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["ping-key"], queryFn: () => api.settings.pingKey.get() })
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [shown, setShown] = useState(false)

  const key = data?.key ?? null
  const base = `${window.location.origin}/ping/k/${key ?? "<key>"}`

  async function rotate() {
    setConfirming(false)
    setBusy(true)
    try {
      await api.settings.pingKey.rotate()
      await qc.invalidateQueries({ queryKey: ["ping-key"] })
      setShown(true)
      toast(t(key ? "settings.pingKeyRotated" : "settings.pingKeyCreated"), "success")
    } catch {
      toast(t("settings.pingKeyFailed"), "error")
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null

  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)] lg:col-span-2">
      <h2 className="text-base font-semibold">{t("settings.pingKey")}</h2>
      <p className="text-sm text-dim">{t("settings.pingKeyIntro")}</p>

      {key ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <code className="break-all font-mono text-xs" data-testid="ping-key">
              {shown ? key : `${key.slice(0, 6)}${"•".repeat(12)}`}
            </code>
            <Button variant="ghost" size="sm" onClick={() => setShown((v) => !v)}>
              {t(shown ? "settings.pingKeyHide" : "settings.pingKeyShow")}
            </Button>
            <CopyButton text={key} />
          </div>
          <p className="text-xs text-dim">{t("settings.pingKeyExample")}</p>
          <pre className="overflow-x-auto rounded-md border border-line bg-ground p-3 font-mono text-xs">
            {`curl -fsS "${base}/<slug>"\ncurl -fsS "${base}/<slug>?create=1&timeout=86400&grace=3600"`}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-dim">{t("settings.pingKeyNone")}</p>
      )}

      <Button
        variant={key ? "ghost" : "primary"}
        size="sm"
        disabled={busy}
        onClick={() => (key ? setConfirming(true) : void rotate())}
      >
        {t(key ? "settings.pingKeyRotate" : "settings.pingKeyGenerate")}
      </Button>

      <ConfirmModal
        open={confirming}
        title={t("settings.pingKeyRotateTitle")}
        message={t("settings.pingKeyRotateMessage")}
        confirmLabel={t("settings.pingKeyRotate")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={() => void rotate()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  )
}
