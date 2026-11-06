import { useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { useNavigate } from "react-router"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { IconButton } from "@/components/shared/IconButton"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

export function DeleteMonitorButton({ monitorId }: { monitorId: string }) {
  const { t } = useT()
  const _navigate = useNavigate()
  const queryClient = useQueryClient()
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
    } catch {
      // Undo data is best-effort; deletion must still go ahead.
    }

    try {
      await api.monitors.delete(monitorId)
      setConfirmOpen(false)
      queryClient.invalidateQueries()
      toast(t("monitors.deleted"), "success")
    } catch {
      toast(t("monitors.failedDelete"), "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <IconButton
        label={t("monitors.delete")}
        className="hover:text-down"
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
      </IconButton>

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
