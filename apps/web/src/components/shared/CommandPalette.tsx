import {
  Activity,
  AlertTriangle,
  Bell,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
} from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { useT } from "@/lib/i18n"

type Command = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  to: string
}

/** Ctrl/⌘+K. Native <dialog>: focus trap, Esc and inert background come for free. */
export function CommandPalette() {
  const { t } = useT()
  const navigate = useNavigate()
  const ref = useRef<HTMLDialogElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)

  const commands = useMemo<Command[]>(() => {
    const go = (page: string) => t("cmd.goTo", { page })
    return [
      { id: "dashboard", label: go(t("nav.dashboard")), icon: LayoutDashboard, to: "/dashboard" },
      { id: "monitors", label: go(t("nav.monitors")), icon: Activity, to: "/monitors" },
      { id: "incidents", label: go(t("nav.incidents")), icon: AlertTriangle, to: "/incidents" },
      { id: "notifications", label: go(t("nav.notifications")), icon: Bell, to: "/notifications" },
      { id: "settings", label: go(t("nav.settings")), icon: Settings, to: "/settings" },
      { id: "new", label: t("cmd.newMonitor"), icon: Plus, to: "/monitors/new" },
    ]
  }, [t])

  const q = query.trim().toLowerCase()
  const filtered = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setQuery("")
        setActive(0)
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  function run(c: Command | undefined) {
    if (!c) return
    setOpen(false)
    navigate(c.to)
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => (i + 1) % Math.max(filtered.length, 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      run(filtered[active])
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={() => setOpen(false)}
      aria-label={t("cmd.title")}
      className="m-auto mt-[15vh] w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-panel p-0 text-ink shadow-[0_18px_48px_-12px_rgb(0_0_0/0.6)] backdrop:bg-black/60"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
        <input
          autoFocus
          type="text"
          aria-label={t("cmd.placeholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onInputKey}
          placeholder={t("cmd.placeholder")}
          className="min-h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus-visible:outline-none focus-visible:shadow-[inset_0_-2px_0_var(--signal)]"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-dim">{t("cmd.noResults", { query })}</p>
      ) : (
        <ul id={listId} className="max-h-72 overflow-y-auto py-1">
          {filtered.map((c, i) => {
            const Icon = c.icon
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={i === active ? "true" : undefined}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(c)}
                  className={`flex min-h-10 w-full items-center gap-3 px-4 text-left text-sm ${
                    i === active ? "bg-raised text-ink" : "text-dim"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {c.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="border-t border-line px-4 py-2 text-xs text-dim">{t("cmd.hint")}</p>
    </dialog>
  )
}
