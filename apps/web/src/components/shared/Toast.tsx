import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from "lucide-react"
import { createContext, type ReactNode, useCallback, useContext, useState } from "react"
import { useT } from "@/lib/i18n"

type ToastType = "success" | "error" | "warning" | "info"

interface Toast {
  id: string
  type: ToastType
  message: string
  exiting?: boolean
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const icons: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

// Solid chips from the state palette; the icon and the text carry the meaning too.
const colors: Record<ToastType, string> = {
  success: "bg-[var(--chip-healthy-bg)] text-[var(--chip-healthy-fg)]",
  error: "bg-[var(--chip-down-bg)] text-[var(--chip-down-fg)]",
  warning: "bg-[var(--chip-missed-bg)] text-[var(--chip-missed-fg)]",
  info: "bg-[var(--chip-pending-bg)] text-[var(--chip-pending-fg)]",
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useT()
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, exiting: true } : x)))
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 300)
  }, [])

  const addToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { id, type, message }])

      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <section
        aria-label={t("toast.region")}
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      >
        {toasts.map((item) => {
          const Icon = icons[item.type]
          return (
            <div
              key={item.id}
              role={item.type === "error" ? "alert" : "status"}
              className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-[4px] border border-line-strong px-4 py-3 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.5)] transition-[opacity,transform] duration-300 ${
                colors[item.type]
              } ${item.exiting ? "translate-x-4 opacity-0" : "translate-x-0 opacity-100"}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm font-medium">{item.message}</p>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => dismiss(item.id)}
                className="shrink-0 rounded-[2px] p-1 hover:bg-black/10"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </section>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used inside ToastProvider")
  return ctx
}
