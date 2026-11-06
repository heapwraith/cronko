import { TriangleAlert } from "lucide-react"
import { useEffect, useRef } from "react"
import { useT } from "@/lib/i18n"
import { Button } from "./Button"

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "danger" | "warning"
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Native <dialog>: focus is trapped, Esc closes, the page behind is inert, and
 * it renders in the top layer — none of which needs hand-rolled code.
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useT()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-panel p-0 text-ink shadow-[0_18px_48px_-12px_rgb(0_0_0/0.6)] backdrop:bg-black/60"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <TriangleAlert
            className={`mt-0.5 h-5 w-5 shrink-0 ${variant === "danger" ? "text-down" : "text-missed"}`}
            aria-hidden="true"
          />
          <div>
            <h2 id="confirm-title" className="text-base font-semibold">
              {title}
            </h2>
            <p className="mt-1 text-sm text-dim">{message}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line bg-raised px-5 py-3">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
          {cancelLabel ?? t("common.cancel")}
        </Button>
        <Button
          variant={variant === "danger" ? "danger" : "primary"}
          size="sm"
          onClick={onConfirm}
          disabled={loading}
        >
          {confirmLabel ?? t("common.confirm")}
        </Button>
      </div>
    </dialog>
  )
}
