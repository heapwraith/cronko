"use client"

import { Eye, EyeOff, Loader2, Moon, Sun } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { CronkoLogo } from "@/components/shared/CronkoLogo"
import { useTheme } from "@/components/shared/ThemeProvider"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"

function ThemeToggle() {
  const { t } = useT()
  const { theme, setTheme } = useTheme()
  const next = theme === "dark" ? "light" : ("dark" as const)
  const Icon = theme === "dark" ? Sun : Moon
  const label = theme === "dark" ? t("auth.switchToLight") : t("auth.switchToDark")

  const handleClick = (e: React.MouseEvent) => {
    const fn = (window as Window & { __cronkoSetOrigin?: (x: number, y: number) => void })
      .__cronkoSetOrigin
    if (fn) fn(e.clientX, e.clientY)
    setTheme(next)
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-center h-9 w-9 rounded-lg text-[#697386] dark:text-zinc-400 hover:text-[#1a1f36] dark:hover:text-zinc-200 hover:bg-[#f4f2ee] dark:hover:bg-zinc-800 transition-all duration-200"
      title={label}
      aria-label={label}
    >
      <Icon className="h-4.5 w-4.5 transition-transform duration-300 rotate-0 hover:rotate-12" />
    </button>
  )
}

export default function LoginPage() {
  const { t } = useT()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    api.auth
      .me()
      .then(() => router.replace("/dashboard"))
      .catch(() => setChecking(false))
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await api.auth.login({ email, password })
      startTransition(() => router.push("/dashboard"))
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

  const inputClass =
    "w-full rounded-lg border border-[#dde0e4] dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 pr-10 text-[15px] text-[#1a1f36] dark:text-zinc-100 placeholder:text-[#8e99a8] dark:placeholder:text-zinc-500 focus:placeholder:opacity-50 focus:outline-none focus:shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_0_0_4px_rgba(94,106,210,0.1)] dark:focus:shadow-[0_0_0_1px_rgba(94,106,210,0.4),0_0_0_4px_rgba(94,106,210,0.08)] transition-all duration-200 disabled:opacity-50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none"

  if (checking) {
    return (
      <div className="min-h-screen bg-[#f6f8fa] dark:bg-zinc-950 flex items-center justify-center p-4 transition-colors">
        <Loader2 className="h-6 w-6 animate-spin text-[#8e99a8]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6f8fa] dark:bg-zinc-950 flex items-center justify-center p-4 transition-colors">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-85">
        <div className="flex flex-col items-center mb-10">
          <div className="rounded-xl bg-emerald-500/10 p-3 mb-4">
            <CronkoLogo className="h-6 w-6 text-emerald-500" />
          </div>
          <span className="text-xl font-semibold text-[#1a1f36] dark:text-zinc-100 tracking-tight">
            Cronko
          </span>
        </div>

        <div className="rounded-2xl border border-[#e8eaed] dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm transition-colors">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2.5 text-[13px] text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={loading}
                className={inputClass}
                placeholder={t("auth.email")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    passwordRef.current?.focus()
                  }
                }}
              />
            </div>
            <div className="relative">
              <input
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className={inputClass}
                placeholder={t("auth.password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e99a8] dark:text-zinc-500 hover:text-[#697386] dark:hover:text-zinc-300 transition-colors"
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={loading || isPending}
              className="w-full rounded-lg bg-[#1a1f36] hover:bg-[#2d3348] dark:bg-zinc-800 dark:hover:bg-zinc-700 px-4 py-3 text-[15px] font-medium text-white transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("auth.signingIn")}
                </>
              ) : isPending ? (
                t("auth.redirecting")
              ) : (
                t("auth.signIn")
              )}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-[#8e99a8] dark:text-zinc-500">
          {t("auth.selfHosted")}
        </p>
      </div>
    </div>
  )
}
