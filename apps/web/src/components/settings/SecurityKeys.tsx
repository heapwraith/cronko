import { startRegistration } from "@simplewebauthn/browser"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/shared/Button"
import { useToast } from "@/components/shared/Toast"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"

const control =
  "min-h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink placeholder:text-dim focus-visible:outline-2 disabled:opacity-50"

/** Security keys (WebAuthn) as an extra second factor. Shown only while the authenticator app is on. */
export function SecurityKeys() {
  const { t } = useT()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ["security-keys"],
    queryFn: () => api.twoFactor.keys.list(),
  })
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const [password, setPassword] = useState("")

  if (!data) return null
  const refresh = () => qc.invalidateQueries({ queryKey: ["security-keys"] })

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const options = await api.twoFactor.keys.registerOptions()
      const response = await startRegistration({ optionsJSON: options })
      await api.twoFactor.keys.registerVerify({ name: name.trim(), response })
      setName("")
      await refresh()
      toast(t("settings.keysAdded"), "success")
    } catch (err) {
      // The browser throws NotAllowedError when the prompt is cancelled or times out.
      if ((err as { name?: string } | null)?.name === "NotAllowedError") {
        toast(t("settings.keysCancelled"), "error")
      } else toast(t("settings.keysFailed"), "error")
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!removing || !password) return
    setBusy(true)
    try {
      await api.twoFactor.keys.remove(removing.id, password)
      setRemoving(null)
      setPassword("")
      await refresh()
      toast(t("settings.keysRemoved"), "success")
    } catch (err) {
      toast(
        err instanceof ApiError && err.status === 401
          ? t("settings.keysWrongPassword")
          : t("settings.keysFailed"),
        "error",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <h3 className="text-sm font-semibold">{t("settings.keys")}</h3>
      <p className="text-sm text-dim">{t("settings.keysIntro")}</p>

      {!data.available ? (
        <p className="text-sm text-dim">{t("settings.keysNeedUrl")}</p>
      ) : (
        <>
          {data.credentials.length === 0 ? (
            <p className="text-sm text-dim">{t("settings.keysNone")}</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {data.credentials.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{k.name}</p>
                    <p className="text-xs text-dim">
                      {k.lastUsedAt
                        ? t("settings.keysLastUsed", {
                            when: new Date(k.lastUsedAt).toLocaleString(),
                          })
                        : t("settings.keysNeverUsed")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setRemoving({ id: k.id, name: k.name })}
                  >
                    {t("settings.keysRemove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {removing && (
            <div className="space-y-2 rounded-md border border-line bg-ground p-3">
              <p className="text-sm">{t("settings.keysRemoveAsk", { name: removing.name })}</p>
              <label className="block text-sm font-medium" htmlFor="key-remove-password">
                {t("auth.password")}
              </label>
              <input
                id="key-remove-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={control}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" disabled={busy || !password} onClick={remove}>
                  {t("settings.keysRemove")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRemoving(null)
                    setPassword("")
                  }}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}

          <div className="grid items-end gap-3 sm:grid-cols-[2fr_auto]">
            <label className="text-sm font-medium">
              <span className="mb-1.5 block">{t("settings.keysName")}</span>
              <input
                type="text"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("settings.keysNamePlaceholder")}
                className={control}
              />
            </label>
            <Button size="sm" disabled={busy || !name.trim()} onClick={add}>
              {t("settings.keysAdd")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
