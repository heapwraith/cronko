import {
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
} from "@simplewebauthn/browser"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { Button } from "@/components/shared/Button"
import { CronkoLogo } from "@/components/shared/CronkoLogo"
import { IconButton } from "@/components/shared/IconButton"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"

const SSO_ERRORS = [
  "denied",
  "invalid_state",
  "failed",
  "not_allowed",
  "provider_unavailable",
  "rate_limited",
  "untrusted_proxy",
  "no_identity",
] as const

export default function LoginPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Which sign-in methods the server offers; the password form is the default until it answers.
  const [sso, setSso] = useState({ oidc: false, proxy: false, passwordLogin: true })
  const ssoError = params.get("sso_error")
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // Set once the password was accepted and the account needs a second factor.
  const [challenge, setChallenge] = useState<string | null>(null)
  // Options for a security key, when the account has one (offered next to the code).
  const [keyOptions, setKeyOptions] = useState<PublicKeyCredentialRequestOptionsJSON | null>(null)
  const [code, setCode] = useState("")
  const [recovery, setRecovery] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const codeId = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    api.auth
      .me()
      .then(() => navigate("/dashboard", { replace: true }))
      .catch(() => setChecking(false))
  }, [navigate])

  useEffect(() => {
    api.auth
      .ssoConfig()
      .then(setSso)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!checking && sso.passwordLogin) emailRef.current?.focus()
  }, [checking, sso.passwordLogin])

  async function signInWithKey() {
    if (!challenge || !keyOptions) return
    setError(null)
    setLoading(true)
    try {
      const response = await startAuthentication({ optionsJSON: keyOptions })
      await api.auth.loginWebauthn({ challenge, response })
      startTransition(() => navigate("/dashboard"))
    } catch (err) {
      if ((err as { name?: string } | null)?.name === "NotAllowedError") {
        // Cancelled in the browser: the server never saw it, so the same step still works.
        setError(t("auth.keyCancelled"))
      } else if (err instanceof ApiError && err.status === 429) {
        setError(t("auth.tooManyAttempts"))
      } else {
        // The server spends a challenge on every answer, so start over from the password.
        setChallenge(null)
        setKeyOptions(null)
        setCode("")
        setError(t("auth.keyFailed"))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (challenge) {
        await api.auth.loginTwoFactor({ challenge, code: code.trim() })
      } else {
        const res = await api.auth.login({ email, password })
        if (res.twoFactorRequired) {
          setChallenge(res.challenge)
          setKeyOptions(res.webauthn ?? null)
          setPassword("")
          setTimeout(() => codeRef.current?.focus(), 0)
          return
        }
      }
      startTransition(() => navigate("/dashboard"))
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(t("auth.tooManyAttempts"))
      } else if (err instanceof ApiError && err.status === 401) {
        if (challenge && (err.body as { code?: string } | null)?.code === "UNAUTHORIZED") {
          // The challenge itself expired: start over from the password.
          setChallenge(null)
          setCode("")
          setError(t("auth.invalidCredentials"))
        } else {
          setError(challenge ? t("auth.invalidCode") : t("auth.invalidCredentials"))
        }
      } else {
        setError(t("auth.cannotReachServer"))
      }
    } finally {
      setLoading(false)
    }
  }

  if (checking) return <div className="min-h-screen bg-ground" />

  const hasSso = sso.oidc || sso.proxy
  const ssoMessage = ssoError
    ? t(
        SSO_ERRORS.includes(ssoError as (typeof SSO_ERRORS)[number])
          ? `auth.sso.${ssoError}`
          : "auth.sso.failed",
      )
    : null
  const ssoLink =
    "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-line-strong bg-ground px-3 text-[15px] font-semibold text-ink hover:bg-panel focus-visible:outline-2"

  const field =
    "min-h-11 w-full rounded-md border border-line-strong bg-ground px-3 text-[15px] text-ink placeholder:text-dim disabled:opacity-50"

  return (
    <div className="flex min-h-screen flex-col bg-ground bg-[radial-gradient(60rem_30rem_at_50%_-10%,color-mix(in_oklch,var(--signal)_18%,transparent),transparent)]">
      <div className="flex justify-end p-3">
        <ThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 pb-24">
        <div className="mb-8 flex items-center justify-center gap-3">
          <CronkoLogo className="h-9 w-9 text-signal-text" />
          <span className="text-3xl font-semibold tracking-tight">Cronko</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-line bg-panel p-6 shadow-[var(--shadow-card)]"
          noValidate
        >
          {challenge ? (
            <div className="space-y-3">
              <p className="text-base font-semibold">{t("auth.codeTitle")}</p>
              <p className="text-sm text-dim">
                {recovery ? t("auth.recoveryHint") : t("auth.codeHint")}
              </p>
              <div>
                <label htmlFor={codeId} className="mb-1.5 block text-sm font-semibold">
                  {t("auth.code")}
                </label>
                <input
                  ref={codeRef}
                  id={codeId}
                  type="text"
                  inputMode={recovery ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  required
                  maxLength={recovery ? 32 : 7}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={loading}
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={error ? true : undefined}
                  className={`${field} font-mono`}
                />
              </div>
              {keyOptions && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={loading}
                  onClick={signInWithKey}
                >
                  {t("auth.useKey")}
                </Button>
              )}
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <button
                  type="button"
                  className="text-signal-text underline underline-offset-2"
                  onClick={() => {
                    setRecovery((v) => !v)
                    setCode("")
                    setError(null)
                  }}
                >
                  {recovery ? t("auth.useAuthenticator") : t("auth.useRecovery")}
                </button>
                <button
                  type="button"
                  className="text-dim underline underline-offset-2"
                  onClick={() => {
                    setChallenge(null)
                    setKeyOptions(null)
                    setCode("")
                    setRecovery(false)
                    setError(null)
                  }}
                >
                  {t("auth.back")}
                </button>
              </div>
            </div>
          ) : sso.passwordLogin ? (
            <>
              <div>
                <label htmlFor={emailId} className="mb-1.5 block text-sm font-semibold">
                  {t("auth.email")}
                </label>
                <input
                  ref={emailRef}
                  id={emailId}
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={error ? true : undefined}
                  className={field}
                />
              </div>

              <div>
                <label htmlFor={passwordId} className="mb-1.5 block text-sm font-semibold">
                  {t("auth.password")}
                </label>
                <div className="relative">
                  <input
                    id={passwordId}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    aria-describedby={error ? errorId : undefined}
                    aria-invalid={error ? true : undefined}
                    className={`${field} pr-11`}
                  />
                  <IconButton
                    label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </IconButton>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-dim">{t("auth.sso.only")}</p>
          )}

          {(error || ssoMessage) && (
            <p
              id={errorId}
              role="alert"
              className="rounded-md bg-[var(--chip-down-bg)] px-3 py-2 text-sm text-[var(--chip-down-fg)]"
            >
              {error ?? ssoMessage}
            </p>
          )}

          {!challenge && hasSso && (
            <div className="space-y-2">
              {sso.oidc && (
                <a href="/auth/sso/oidc/start" className={ssoLink}>
                  {t("auth.sso.signIn")}
                </a>
              )}
              {sso.proxy && (
                <a href="/auth/sso/proxy" className={ssoLink}>
                  {t("auth.sso.proxy")}
                </a>
              )}
              {sso.passwordLogin && (
                <p className="pt-1 text-center text-xs text-dim">{t("auth.sso.or")}</p>
              )}
            </div>
          )}

          {(sso.passwordLogin || challenge) && (
            <Button type="submit" className="w-full" disabled={loading || isPending}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("auth.signingIn")}
                </>
              ) : isPending ? (
                t("auth.redirecting")
              ) : challenge ? (
                t("auth.verify")
              ) : (
                t("auth.signIn")
              )}
            </Button>
          )}
        </form>

        <p className="mt-8 text-center text-sm text-dim">{t("auth.selfHosted")}</p>
      </main>
    </div>
  )
}
