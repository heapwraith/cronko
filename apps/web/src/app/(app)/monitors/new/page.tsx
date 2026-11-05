"use client"

import { Activity, ArrowRight, CalendarClock, CheckCircle2, Clock, Timer } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { z } from "zod"
import { Breadcrumb } from "@/components/shared/Breadcrumb"
import { CopyButton } from "@/components/shared/CopyButton"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"

const schema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  expectedIntervalSeconds: z.coerce
    .number()
    .int()
    .min(10, "Must be at least 10 seconds")
    .max(31_536_000, "Must be at most 1 year"),
  gracePeriodSeconds: z.coerce.number().int().min(0).max(86_400).optional().default(120),
})

const PRESETS = [
  { label: "5 min", seconds: 300, icon: Timer },
  { label: "1 hour", seconds: 3600, icon: Clock },
  { label: "24 hours", seconds: 86400, icon: CalendarClock },
]

function cronToSeconds(expr: string): number | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minutes = parts[0] ?? ""
  const hours = parts[1] ?? ""
  if (minutes === "*") return 60
  if (minutes.startsWith("*/")) {
    const i = parseInt(minutes.slice(2), 10)
    if (i > 0) return i * 60
  }
  if (minutes === "0" && hours === "*") return 3600
  if (hours.startsWith("*/") && (minutes === "0" || minutes === "*")) {
    const i = parseInt(hours.slice(2), 10)
    if (i > 0) return i * 3600
  }
  return null
}

function formatSecondsReadable(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}min`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

const inputBase =
  "w-full rounded-lg border px-3 py-2 text-sm text-[#1a1f36] dark:text-zinc-100 placeholder:text-[#8e99a8] dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/40 transition-colors shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none"
const inputNormal = `${inputBase} border-[#dde0e4] dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:border-[#5e6ad2]/40`
const inputError = `${inputBase} border-red-400 dark:border-red-500 bg-red-50/30 dark:bg-red-950/10 focus:border-red-400 focus:ring-red-400/40`
const labelClass = "block text-xs font-medium text-[#697386] dark:text-zinc-500 mb-1.5"
const hintClass = "text-[10px] text-[#8e99a8] dark:text-zinc-500 mt-1 leading-relaxed"

export default function NewMonitorPage() {
  const { t } = useT()
  const router = useRouter()
  const [name, setName] = useState("")
  const [expectedIntervalSeconds, setExpectedIntervalSeconds] = useState("")
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState("120")
  const [maxDurationMs, setMaxDurationMs] = useState("")
  const [cronMode, setCronMode] = useState(false)
  const [cronExpr, setCronExpr] = useState("")
  const [cronError, setCronError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const [created, setCreated] = useState<{
    name: string
    token: string
    slug: string
    interval: number
    grace: number
    maxDuration?: number
  } | null>(null)

  function applyPreset(seconds: number) {
    setExpectedIntervalSeconds(String(seconds))
    setFieldErrors((p) => {
      const n = { ...p }
      delete n["expectedIntervalSeconds"]
      return n
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const result = schema.safeParse({
      name: name.trim(),
      expectedIntervalSeconds,
      gracePeriodSeconds,
    })

    if (!result.success) {
      const errors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string
        errors[field] = issue.message
      }
      setFieldErrors(errors)
      return
    }

    setSubmitting(true)
    try {
      const monitor = await api.monitors.create({
        name: result.data.name,
        expectedIntervalSeconds: result.data.expectedIntervalSeconds,
        gracePeriodSeconds: result.data.gracePeriodSeconds,
        ...(maxDurationMs.trim() && { maxDurationMs: parseInt(maxDurationMs, 10) }),
      })
      setCreated({
        name: monitor.name,
        token: monitor.token,
        slug: monitor.slug,
        interval: result.data.expectedIntervalSeconds,
        grace: result.data.gracePeriodSeconds,
        ...(maxDurationMs.trim() ? { maxDuration: parseInt(maxDurationMs, 10) } : {}),
      })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("monitors.failedCreate"),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const pingUrl = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/ping/${created?.token ?? ""}`

  if (created) {
    return (
      <div className="max-w-lg space-y-6">
        <Breadcrumb
          items={[
            { label: t("nav.dashboard"), href: "/dashboard" },
            { label: t("nav.monitors"), href: "/monitors" },
            { label: created.name },
          ]}
        />

        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-950/10 px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            {t("monitors.monitorCreated")}
          </p>
        </div>

        <div className="rounded-xl border border-[#e8eaed] dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm transition-colors">
          <div className="border-b border-[#e8eaed] dark:border-zinc-800/80 px-5 py-3.5">
            <h2 className="text-xs uppercase tracking-wider text-[#697386] dark:text-zinc-500 font-medium">
              {t("monitor.pingUrl")}
            </h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <code className="text-sm text-[#1a1f36] dark:text-zinc-300 break-all">
                GET {pingUrl}
              </code>
              <CopyButton text={pingUrl} />
            </div>

            <div className="rounded-lg border border-[#e8eaed] dark:border-zinc-700 bg-[#f6f8fa] dark:bg-zinc-800/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#8e99a8] dark:text-zinc-500 mb-1">
                curl
              </p>
              <code className="text-xs text-[#1a1f36] dark:text-zinc-300 break-all">
                curl -s {pingUrl}
              </code>
            </div>

            <p className="text-xs text-[#697386] dark:text-zinc-500 leading-relaxed">
              {t("monitor.setupInstructions", {
                interval: formatSecondsReadable(created.interval),
              })}
            </p>

            <div className="flex gap-3 pt-2">
              <Link
                href={`/monitors/${created.slug}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors"
              >
                {t("monitor.overview")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <button
                onClick={() => {
                  setCreated(null)
                  setName("")
                  setExpectedIntervalSeconds("")
                  setGracePeriodSeconds("120")
                  setMaxDurationMs("")
                }}
                className="rounded-lg border border-[#e8eaed] dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-[#697386] dark:text-zinc-400 hover:bg-[#f6f8fa] dark:hover:bg-zinc-800 transition-colors"
              >
                {t("monitor.createAnother")}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <Breadcrumb
        items={[
          { label: t("nav.dashboard"), href: "/dashboard" },
          { label: t("nav.monitors"), href: "/monitors" },
          { label: t("monitors.newMonitor") },
        ]}
      />

      <div>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[#697386]" />
          <h1 className="text-lg font-semibold text-[#1a1f36] dark:text-zinc-100">
            {t("monitors.newMonitor")}
          </h1>
        </div>
        <p className="text-xs text-[#8e99a8] dark:text-zinc-500 mt-1">
          {t("monitors.monitorCreatedDesc")}
        </p>
      </div>

      <div className="rounded-xl border border-[#e8eaed] dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm transition-colors">
        <div className="border-b border-[#e8eaed] dark:border-zinc-800/80 px-5 py-3.5">
          <h2 className="text-xs uppercase tracking-wider text-[#697386] dark:text-zinc-500 font-medium">
            {t("monitors.monitorDetails")}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className={labelClass}>{t("monitors.monitorName")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setFieldErrors((p) => {
                  const n = { ...p }
                  delete n["name"]
                  return n
                })
              }}
              className={fieldErrors.name ? inputError : inputNormal}
              placeholder={t("monitors.monitorNameHint")}
            />
            {fieldErrors.name && (
              <p className="text-[10px] text-red-500 mt-1">{fieldErrors.name}</p>
            )}
            <p className={hintClass}>{t("monitors.monitorNameHint")}</p>
          </div>

          <div>
            <label className={labelClass}>{t("monitors.expectedInterval")}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  value={expectedIntervalSeconds}
                  onChange={(e) => {
                    setExpectedIntervalSeconds(e.target.value)
                    setFieldErrors((p) => {
                      const n = { ...p }
                      delete n["expectedIntervalSeconds"]
                      return n
                    })
                  }}
                  className={fieldErrors.expectedIntervalSeconds ? inputError : inputNormal}
                  placeholder="86400"
                  min={10}
                />
              </div>
              {expectedIntervalSeconds && (
                <span className="text-[10px] text-[#8e99a8] dark:text-zinc-500 tabular-nums shrink-0">
                  ≈ {formatSecondsReadable(Number(expectedIntervalSeconds))}
                </span>
              )}
            </div>
            {fieldErrors.expectedIntervalSeconds && (
              <p className="text-[10px] text-red-500 mt-1">{fieldErrors.expectedIntervalSeconds}</p>
            )}
            <p className={hintClass}>{t("monitors.expectedIntervalHint")}</p>
            <div className="flex items-center gap-2 mt-2">
              {PRESETS.map((p) => (
                <button
                  key={p.seconds}
                  type="button"
                  onClick={() => applyPreset(p.seconds)}
                  className={`inline-flex items-center gap-1 rounded-lg border text-xs font-medium px-2.5 py-1.5 transition-colors ${
                    expectedIntervalSeconds === String(p.seconds)
                      ? "border-[#5e6ad2]/40 bg-[#5e6ad2]/10 text-[#5e6ad2] dark:text-[#5e6ad2]"
                      : "border-[#e8eaed] dark:border-zinc-700 text-[#697386] dark:text-zinc-400 hover:bg-[#f6f8fa] dark:hover:bg-zinc-800"
                  }`}
                >
                  <p.icon className="h-3 w-3" />
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCronMode(!cronMode)
                  setCronError(null)
                }}
                className={`text-xs rounded-lg px-2 py-1 border transition-colors ${
                  cronMode
                    ? "border-[#5e6ad2]/40 bg-[#5e6ad2]/10 text-[#5e6ad2] dark:text-[#5e6ad2]"
                    : "border-[#e8eaed] dark:border-zinc-700 text-[#697386] dark:text-zinc-400"
                }`}
              >
                cron
              </button>
            </div>

            {cronMode && (
              <div className="mt-2">
                <label className={labelClass}>{t("monitors.cronExpression")}</label>
                <input
                  type="text"
                  value={cronExpr}
                  onChange={(e) => {
                    setCronExpr(e.target.value)
                    setCronError(null)
                    const secs = cronToSeconds(e.target.value)
                    if (secs) setExpectedIntervalSeconds(String(secs))
                    else if (e.target.value.length >= 5) setCronError(t("monitors.cronParseError"))
                  }}
                  className={cronError ? inputError : inputNormal}
                  placeholder="*/5 * * * *"
                />
                {cronError && <p className="text-[10px] text-red-500 mt-1">{cronError}</p>}
                <p className={hintClass}>{t("monitors.cronExamples")}</p>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>{t("monitors.maxDuration")}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  value={maxDurationMs}
                  onChange={(e) => {
                    setMaxDurationMs(e.target.value)
                    setFieldErrors((p) => {
                      const n = { ...p }
                      delete n["maxDurationMs"]
                      return n
                    })
                  }}
                  className={fieldErrors.maxDurationMs ? inputError : inputNormal}
                  placeholder="5000"
                />
              </div>
              {maxDurationMs && (
                <span className="text-[10px] text-[#8e99a8] dark:text-zinc-500 tabular-nums shrink-0">
                  ≈ {formatSecondsReadable(Number(maxDurationMs))}
                </span>
              )}
            </div>
            {fieldErrors.maxDurationMs && (
              <p className="text-[10px] text-red-500 mt-1">{fieldErrors.maxDurationMs}</p>
            )}
            <p className={hintClass}>{t("monitors.maxDurationHint")}</p>
          </div>

          <div>
            <label className={labelClass}>{t("monitors.gracePeriod")}</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  value={gracePeriodSeconds}
                  onChange={(e) => {
                    setGracePeriodSeconds(e.target.value)
                    setFieldErrors((p) => {
                      const n = { ...p }
                      delete n["gracePeriodSeconds"]
                      return n
                    })
                  }}
                  className={fieldErrors.gracePeriodSeconds ? inputError : inputNormal}
                  placeholder="120"
                />
              </div>
              {gracePeriodSeconds && (
                <span className="text-[10px] text-[#8e99a8] dark:text-zinc-500 tabular-nums shrink-0">
                  ≈ {formatSecondsReadable(Number(gracePeriodSeconds))}
                </span>
              )}
            </div>
            {fieldErrors.gracePeriodSeconds && (
              <p className="text-[10px] text-red-500 mt-1">{fieldErrors.gracePeriodSeconds}</p>
            )}
            <p className={hintClass}>{t("monitors.gracePeriodHint")}</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors"
            >
              {submitting ? t("monitors.creating") : t("monitors.create")}
            </button>
            <Link
              href="/monitors"
              className="rounded-lg border border-[#e8eaed] dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-[#697386] dark:text-zinc-400 hover:bg-[#f6f8fa] dark:hover:bg-zinc-800 transition-colors"
            >
              {t("common.cancel")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
