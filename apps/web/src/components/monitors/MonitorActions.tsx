"use client"

import { Pause, Pencil, Play, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

export function MonitorActions({ monitorId, status }: { monitorId: string; status: string }) {
  const { t } = useT()
  const router = useRouter()
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  async function handlePause() {
    setPauseLoading(true)
    try {
      await api.monitors.pause(monitorId)
      toast(t("monitors.pausedSuccess"), "info")
      router.refresh()
    } catch {
      toast(t("monitors.failedPause"), "error")
    } finally {
      setPauseLoading(false)
    }
  }

  async function handleResume() {
    setResumeLoading(true)
    try {
      await api.monitors.resume(monitorId)
      toast(t("monitors.resumedSuccess"), "success")
      router.refresh()
    } catch {
      toast(t("monitors.failedResume"), "error")
    } finally {
      setResumeLoading(false)
    }
  }

  async function handleDelete() {
    setDeleteLoading(true)
    try {
      await api.monitors.delete(monitorId)
      toast(t("monitors.deleted"), "success")
      setConfirmOpen(false)
      router.push("/monitors")
    } catch {
      toast(t("monitors.failedDelete"), "error")
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/monitors/${monitorId}/edit`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700 transition-colors"
      >
        <Pencil className="h-3 w-3" />
        {t("monitors.edit")}
      </Link>

      {status !== "paused" ? (
        <button
          onClick={handlePause}
          disabled={pauseLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          <Pause className="h-3 w-3" />
          {pauseLoading ? t("monitor.pausing") : t("monitors.pause")}
        </button>
      ) : (
        <button
          onClick={handleResume}
          disabled={resumeLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          <Play className="h-3 w-3" />
          {resumeLoading ? t("monitor.resuming") : t("monitors.resume")}
        </button>
      )}

      <button
        onClick={() => setConfirmOpen(true)}
        disabled={deleteLoading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/30 disabled:opacity-50 transition-colors"
      >
        <Trash2 className="h-3 w-3" />
        {deleteLoading ? t("monitors.deleting") : t("monitors.delete")}
      </button>

      <ConfirmModal
        open={confirmOpen}
        title={t("monitors.deleteConfirmTitle")}
        message={t("monitors.deleteConfirmMessage", { name: "" })}
        confirmLabel={t("monitors.delete")}
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
