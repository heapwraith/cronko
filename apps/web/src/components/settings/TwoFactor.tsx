import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/shared/Button"
import { CopyButton } from "@/components/shared/CopyButton"
import { useToast } from "@/components/shared/Toast"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { QrCode } from "./QrCode"

const control =
  "min-h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink placeholder:text-dim focus-visible:outline-2 disabled:opacity-50"

type Stage =
  | { kind: "idle" }
  | { kind: "setup"; secret: string; uri: string }
  | { kind: "recovery"; codes: string[] }
  | { kind: "disable" }

/** Two-factor authentication: enroll with an authenticator app, recovery codes, disable. */
export function TwoFactor() {
  const { t } = useT()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: status } = useQuery({
    queryKey: ["two-factor"],
    queryFn: () => api.twoFactor.status(),
  })
  const [stage, setStage] = useState<Stage>({ kind: "idle" })
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: ["two-factor"] })

  function failure(err: unknown) {
    if (err instanceof ApiError && err.status === 429) toast(t("auth.tooManyAttempts"), "error")
    else if (err instanceof ApiError && (err.status === 400 || err.status === 401))
      toast(t("settings.twoFactorInvalid"), "error")
    else toast(t("settings.twoFactorFailed"), "error")
  }

  async function start() {
    setBusy(true)
    try {
      const res = await api.twoFactor.setup()
      setCode("")
      setStage({ kind: "setup", secret: res.secret, uri: res.otpauthUri })
    } catch (err) {
      failure(err)
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!code.trim()) return
    setBusy(true)
    try {
      const res = await api.twoFactor.enable(code.trim())
      setCode("")
      setStage({ kind: "recovery", codes: res.recoveryCodes })
      await refresh()
    } catch (err) {
      failure(err)
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    if (!code.trim() || !password) return
    setBusy(true)
    try {
      await api.twoFactor.disable({ password, code: code.trim() })
      setCode("")
      setPassword("")
      setStage({ kind: "idle" })
      await refresh()
      toast(t("settings.twoFactorDisabledToast"), "success")
    } catch (err) {
      failure(err)
    } finally {
      setBusy(false)
    }
  }

  // The page is one big form: Enter here must not save the settings.
  const onEnter = (action: () => Promise<void>) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void action()
    }
  }

  const cancel = () => {
    setCode("")
    setPassword("")
    setStage({ kind: "idle" })
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)] lg:col-span-2">
      <h2 className="text-base font-semibold">{t("settings.twoFactor")}</h2>
      <p className="text-sm text-dim">{t("settings.twoFactorIntro")}</p>

      {stage.kind === "idle" && status && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {status.enabled
              ? t("settings.twoFactorOn", { n: status.recoveryCodesRemaining })
              : t("settings.twoFactorOff")}
          </p>
          {status.enabled ? (
            <Button variant="danger" size="sm" onClick={() => setStage({ kind: "disable" })}>
              {t("settings.twoFactorDisable")}
            </Button>
          ) : (
            <Button size="sm" onClick={start} disabled={busy}>
              {t("settings.twoFactorEnable")}
            </Button>
          )}
        </div>
      )}

      {stage.kind === "setup" && (
        <div className="space-y-3">
          <p className="text-sm">{t("settings.twoFactorScan")}</p>
          <div className="flex flex-wrap items-start gap-5">
            <QrCode value={stage.uri} label={t("settings.twoFactorQrLabel")} />
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium text-dim">{t("settings.twoFactorSecret")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all font-mono text-sm">{stage.secret}</code>
                <CopyButton text={stage.secret} />
              </div>
            </div>
          </div>
          <label className="block max-w-xs text-sm font-medium">
            <span className="mb-1.5 block">{t("settings.twoFactorCode")}</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={onEnter(confirm)}
              className={`${control} font-mono tnum`}
            />
          </label>
          <div className="flex gap-2">
            <Button onClick={confirm} disabled={busy || !code.trim()}>
              {t("settings.twoFactorConfirm")}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}

      {stage.kind === "recovery" && (
        <div role="status" className="space-y-3 rounded-md border border-line bg-ground p-3">
          <p className="text-sm font-medium">{t("settings.twoFactorRecoveryIntro")}</p>
          <ul className="grid gap-1 font-mono text-sm sm:grid-cols-2">
            {stage.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <CopyButton text={stage.codes.join("\n")} />
            <Button variant="secondary" size="sm" onClick={cancel}>
              {t("settings.twoFactorRecoveryDone")}
            </Button>
          </div>
        </div>
      )}

      {stage.kind === "disable" && (
        <div className="space-y-3">
          <p className="text-sm">{t("settings.twoFactorDisableIntro")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              <span className="mb-1.5 block">{t("settings.twoFactorPassword")}</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onEnter(disable)}
                className={control}
              />
            </label>
            <label className="text-sm font-medium">
              <span className="mb-1.5 block">{t("settings.twoFactorCodeOrRecovery")}</span>
              <input
                type="text"
                autoComplete="one-time-code"
                maxLength={32}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={onEnter(disable)}
                className={`${control} font-mono`}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="danger" onClick={disable} disabled={busy || !code.trim() || !password}>
              {t("settings.twoFactorDisable")}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
