import { Eye, EyeOff, Loader2, Moon, Sun } from "lucide-react"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import { useNavigate } from "react-router"
import { Button } from "@/components/shared/Button"
import { CronkoLogo } from "@/components/shared/CronkoLogo"
import { IconButton } from "@/components/shared/IconButton"
import { useTheme } from "@/components/shared/ThemeProvider"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"

function ThemeToggle() {
  const { t } = useT()
  const { theme, setTheme } = useTheme()
  const dark = theme === "dark"
  const label = dark ? t("auth.switchToLight") : t("auth.switchToDark")
  return (
    <IconButton
      label={label}
      onClick={(e) => {
        const origin = (window as Window & { __cronkoSetOrigin?: (x: number, y: number) => void })
          .__cronkoSetOrigin
        origin?.(e.clientX, e.clientY)
        setTheme(dark ? "light" : "dark")
      }}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </IconButton>
  )
}

export default function LoginPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
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
    if (!checking) emailRef.current?.focus()
  }, [checking])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await api.auth.login({ email, password })
      startTransition(() => navigate("/dashboard"))
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(t("auth.tooManyAttempts"))
      } else if (err instanceof ApiError && err.status === 401) {
        setError(t("auth.invalidCredentials"))
      } else {
        setError(t("auth.cannotReachServer"))
      }
    } finally {
      setLoading(false)
    }
  }

  if (checking) return <div className="min-h-screen bg-ground" />

  const field =
    "min-h-11 w-full rounded-[4px] border border-line-strong bg-panel px-3 text-[15px] text-ink placeholder:text-dim disabled:opacity-50"

  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <div className="h-[3px] bg-signal" />
      <div className="flex justify-end p-3">
        <ThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 pb-24">
        <div className="mb-8 flex items-center gap-3">
          <CronkoLogo className="h-9 w-9 text-signal-text" />
          <span className="text-3xl font-bold uppercase tracking-[0.14em]">Cronko</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

          {error && (
            <p
              id={errorId}
              role="alert"
              className="rounded-[4px] bg-[var(--chip-down-bg)] px-3 py-2 text-sm text-[var(--chip-down-fg)]"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading || isPending}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t("auth.signingIn")}
              </>
            ) : isPending ? (
              t("auth.redirecting")
            ) : (
              t("auth.signIn")
            )}
          </Button>
        </form>

        <p className="mt-8 text-sm text-dim">{t("auth.selfHosted")}</p>
      </main>
    </div>
  )
}
