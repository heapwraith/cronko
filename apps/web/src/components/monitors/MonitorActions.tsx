import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate } from "react-router"
import { Button } from "@/components/shared/Button"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

export function MonitorActions({ monitorId, status }: { monitorId: string; status: string }) {
  const { t } = useT()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
      queryClient.invalidateQueries()
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
      queryClient.invalidateQueries()
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
      navigate("/monitors")
    } catch {
      toast(t("monitors.failedDelete"), "error")
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button href={`/monitors/${monitorId}/edit`} variant="secondary" size="sm">
        {t("monitors.edit")}
      </Button>

      {status !== "paused" ? (
        <Button variant="secondary" size="sm" onClick={handlePause} disabled={pauseLoading}>
          {pauseLoading ? t("monitor.pausing") : t("monitors.pause")}
        </Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={handleResume} disabled={resumeLoading}>
          {resumeLoading ? t("monitor.resuming") : t("monitors.resume")}
        </Button>
      )}

      <Button
        variant="danger"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={deleteLoading}
      >
        {deleteLoading ? t("monitors.deleting") : t("monitors.delete")}
      </Button>

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
