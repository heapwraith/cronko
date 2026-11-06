import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router"
import { z } from "zod"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { useToast } from "@/components/shared/Toast"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"

function useMonitorEditSchema() {
  const { t } = useT()
  return z.object({
    name: z.string().min(1, t("monitors.nameRequired")).max(100),
    expectedIntervalSeconds: z.coerce
      .number()
      .int()
      .min(10, t("monitor.validationMin10"))
      .max(31_536_000, t("monitor.validationMax1yr")),
    gracePeriodSeconds: z.coerce.number().int().min(0).max(86_400).optional().default(120),
  })
}

const inputBase =
  "w-full rounded-lg border px-3 py-2 text-sm text-[#1a1f36] dark:text-zinc-100 placeholder:text-[#8e99a8] dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/40 transition-colors shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none"
const inputNormal = `${inputBase} border-[#dde0e4] dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:border-[#5e6ad2]/40`
const inputError = `${inputBase} border-red-400 dark:border-red-500 bg-red-50/30 dark:bg-red-950/10 focus:border-red-400 focus:ring-red-400/40`
const labelClass = "block text-xs font-medium text-[#697386] dark:text-zinc-500 mb-1.5"
const hintClass = "text-[10px] text-[#8e99a8] dark:text-zinc-500 mt-1 leading-relaxed"

export function MonitorEditForm({
  monitor,
}: {
  monitor: {
    id: string
    name: string
    expectedIntervalSeconds: number
    gracePeriodSeconds: number
  }
}) {
  const { t } = useT()
  const schema = useMonitorEditSchema()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [name, setName] = useState(monitor.name)
  const [expectedIntervalSeconds, setExpectedIntervalSeconds] = useState(
    String(monitor.expectedIntervalSeconds),
  )
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState(String(monitor.gracePeriodSeconds))
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
      await api.monitors.update(monitor.id, {
        name: result.data.name,
        expectedIntervalSeconds: result.data.expectedIntervalSeconds,
        gracePeriodSeconds: result.data.gracePeriodSeconds,
      })
      navigate(`/monitors/${monitor.id}`)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("monitor.failedUpdate"),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.monitors.delete(monitor.id)
      navigate("/monitors")
    } catch {
      toast(t("monitors.failedDelete"), "error")
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  return (
    <div className="space-y-6">
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
            />
            {fieldErrors.name && (
              <p className="text-[10px] text-red-500 mt-1">{fieldErrors.name}</p>
            )}
            <p className={hintClass}>{t("monitors.monitorNameHint")}</p>
          </div>

          <div>
            <label className={labelClass}>{t("monitors.expectedInterval")}</label>
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
              min={10}
            />
            {fieldErrors.expectedIntervalSeconds && (
              <p className="text-[10px] text-red-500 mt-1">{fieldErrors.expectedIntervalSeconds}</p>
            )}
            <p className={hintClass}>{t("monitors.expectedIntervalHint")}</p>
          </div>

          <div>
            <label className={labelClass}>{t("monitors.gracePeriod")}</label>
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
            />
            {fieldErrors.gracePeriodSeconds && (
              <p className="text-[10px] text-red-500 mt-1">{fieldErrors.gracePeriodSeconds}</p>
            )}
            <p className={hintClass}>{t("monitors.gracePeriodHint")}</p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors"
          >
            {submitting ? t("monitors.saving") : t("monitors.saveChanges")}
          </button>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10 shadow-sm transition-colors">
        <div className="border-b border-red-200 dark:border-red-800/50 px-5 py-3.5 flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
          <h2 className="text-xs uppercase tracking-wider font-medium text-red-600 dark:text-red-400">
            {t("monitors.dangerZone")}
          </h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-[#697386] dark:text-zinc-400">
            {t("monitors.dangerZoneDesc")}
          </p>
          <button
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 px-4 py-2 text-sm font-medium transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t("monitors.deleteMonitor")}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        title={t("monitors.deleteConfirmTitle")}
        message={t("monitors.deleteConfirmMessage", { name: monitor.name })}
        confirmLabel={t("monitors.delete")}
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}
