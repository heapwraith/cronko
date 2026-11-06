import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/shared/Button"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { CopyButton } from "@/components/shared/CopyButton"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

const control =
  "min-h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink placeholder:text-dim focus-visible:outline-2 disabled:opacity-50"

type Scope = "read" | "write"

/** Scoped API tokens: create (secret shown once), list, revoke. */
export function ApiTokens() {
  const { t } = useT()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: tokens = [] } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api.settings.tokens.list(),
  })
  const [name, setName] = useState("")
  const [scope, setScope] = useState<Scope>("read")
  const [days, setDays] = useState("")
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null)

  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : t("common.never"))

  // The page is one big form: Enter in these fields creates a token, not saves settings.
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void create()
    }
  }

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const expiresInDays = Number.parseInt(days, 10)
      const created = await api.settings.tokens.create({
        name: name.trim(),
        scope,
        ...(expiresInDays > 0 && { expiresInDays }),
      })
      setSecret(created.token)
      setName("")
      setDays("")
      await qc.invalidateQueries({ queryKey: ["api-tokens"] })
    } catch {
      toast(t("settings.tokensCreateFailed"), "error")
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    setRevoking(null)
    try {
      await api.settings.tokens.revoke(id)
      await qc.invalidateQueries({ queryKey: ["api-tokens"] })
      toast(t("settings.tokensRevoked"), "success")
    } catch {
      toast(t("settings.tokensRevokeFailed"), "error")
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)] lg:col-span-2">
      <h2 className="text-base font-semibold">{t("settings.tokens")}</h2>
      <p className="text-sm text-dim">{t("settings.tokensIntro")}</p>

      {secret && (
        <div role="status" className="space-y-2 rounded-md border border-line bg-ground p-3">
          <p className="text-sm font-medium">{t("settings.tokensCopyNow")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="break-all font-mono text-xs">{secret}</code>
            <CopyButton text={secret} />
            <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>
              {t("settings.tokensDismiss")}
            </Button>
          </div>
        </div>
      )}

      <div className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <label className="text-sm font-medium">
          <span className="mb-1.5 block">{t("settings.tokensName")}</span>
          <input
            type="text"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onEnter}
            placeholder={t("settings.tokensNamePlaceholder")}
            className={control}
          />
        </label>
        <label className="text-sm font-medium">
          <span className="mb-1.5 block">{t("settings.tokensScope")}</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className={control}
          >
            <option value="read">{t("settings.tokensScopeRead")}</option>
            <option value="write">{t("settings.tokensScopeWrite")}</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          <span className="mb-1.5 block">{t("settings.tokensExpires")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            onKeyDown={onEnter}
            placeholder={t("settings.tokensNoExpiry")}
            className={`${control} font-mono tnum`}
          />
        </label>
        <Button onClick={create} disabled={busy || !name.trim()}>
          {t("settings.tokensCreate")}
        </Button>
      </div>

      {tokens.length === 0 ? (
        <p className="text-sm text-dim">{t("settings.tokensEmpty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {tokens.map((tk) => (
            <li key={tk.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">
                  {tk.name}{" "}
                  <span className="font-mono text-xs font-normal text-dim">{tk.prefix}…</span>
                </p>
                <p className="text-xs text-dim">
                  {t(
                    tk.scope === "write" ? "settings.tokensScopeWrite" : "settings.tokensScopeRead",
                  )}
                  {" · "}
                  {t(`settings.tokensStatus_${tk.status}`)}
                  {tk.expiresAt &&
                    ` · ${t("settings.tokensExpiresAt", { date: date(tk.expiresAt) })}`}
                  {" · "}
                  {t("settings.tokensLastUsed", { date: date(tk.lastUsedAt) })}
                </p>
              </div>
              {tk.status === "active" && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setRevoking({ id: tk.id, name: tk.name })}
                >
                  {t("settings.tokensRevoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={revoking !== null}
        onCancel={() => setRevoking(null)}
        title={t("settings.tokensRevokeTitle")}
        message={t("settings.tokensRevokeMessage", { name: revoking?.name ?? "" })}
        confirmLabel={t("settings.tokensRevoke")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={() => revoking && void revoke(revoking.id)}
      />
    </section>
  )
}
