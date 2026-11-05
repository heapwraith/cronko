"use client"

import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

export function DeleteMonitorButton({ monitorId }: { monitorId: string }) {
  const { t } = useT()
  const router = useRouter()
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const undoData = useRef<{
    name: string
    expectedIntervalSeconds: number
    gracePeriodSeconds: number
  } | null>(null)

  async function handleDelete() {
    setLoading(true)

    try {
      const monitor = await api.monitors.get(monitorId)
      undoData.current = {
        name: monitor.name,
        expectedIntervalSeconds: monitor.expectedIntervalSeconds,
        gracePeriodSeconds: monitor.gracePeriodSeconds,
      }
    } catch (e) {
      console.error("Failed to save monitor data for undo:", e)
    }

    try {
      await api.monitors.delete(monitorId)
      setConfirmOpen(false)
      router.refresh()
      toast(t("monitors.deleted"), "success")
    } catch {
      toast(t("monitors.failedDelete"), "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        className="rounded-lg bg-zinc-800 dark:bg-zinc-800 px-2 py-1 text-xs font-medium text-red-400 hover:bg-zinc-700 dark:hover:bg-zinc-700 disabled:opacity-50 inline-flex items-center gap-1 transition-colors"
        title={t("monitors.delete")}
      >
        <Trash2 className="h-3 w-3" />
        {loading ? t("monitors.deleting").replace("...", "") || "..." : ""}
      </button>

      <ConfirmModal
        open={confirmOpen}
        title={t("monitors.deleteConfirmTitle")}
        message={t("monitors.deleteConfirmMessage", { name: "" })}
        confirmLabel={t("monitors.delete")}
        variant="danger"
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
