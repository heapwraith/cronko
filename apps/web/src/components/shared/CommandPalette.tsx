import {
  Activity,
  AlertTriangle,
  Bell,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"

interface CommandItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  keywords?: string[]
}

export function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: CommandItem[] = [
    {
      id: "dashboard",
      label: "Go to Dashboard",
      icon: LayoutDashboard,
      action: () => navigate("/dashboard"),
      keywords: ["home", "overview"],
    },
    {
      id: "monitors",
      label: "Go to Monitors",
      icon: Activity,
      action: () => navigate("/monitors"),
      keywords: ["list", "all"],
    },
    {
      id: "incidents",
      label: "Go to Incidents",
      icon: AlertTriangle,
      action: () => navigate("/incidents"),
      keywords: ["alerts", "issues"],
    },
    {
      id: "notifications",
      label: "Go to Notifications",
      icon: Bell,
      action: () => navigate("/notifications"),
      keywords: ["alerts", "channels"],
    },
    {
      id: "settings",
      label: "Go to Settings",
      icon: Settings,
      action: () => navigate("/settings"),
      keywords: ["config", "preferences"],
    },
    {
      id: "new-monitor",
      label: "New Monitor",
      icon: Plus,
      action: () => navigate("/monitors/new"),
      keywords: ["create", "add"],
    },
  ]

  const filtered = query
    ? commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.keywords?.some((kw) => kw.toLowerCase().includes(query.toLowerCase())),
      )
    : commands

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        setQuery("")
        setSelectedIndex(0)
      }
      return !prev
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        toggle()
      }
      if (!open) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const selected = filtered[selectedIndex]
        if (selected) {
          selected.action()
          setOpen(false)
        }
      } else if (e.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, selectedIndex, filtered, toggle])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center pt-[20vh] p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/80">
          <Search className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none"
          />
          <kbd className="text-[10px] text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-800 rounded px-1.5 py-0.5 font-mono">
            esc
          </kbd>
        </div>

        <div className="max-h-64 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">
              No results for "{query}"
            </div>
          ) : (
            filtered.map((cmd, i) => {
              const Icon = cmd.icon
              const isSelected = i === selectedIndex
              return (
                <button
                  key={cmd.id}
                  onClick={() => {
                    cmd.action()
                    setOpen(false)
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    isSelected
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{cmd.label}</span>
                  {isSelected && (
                    <kbd className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">↵</kbd>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800/80 px-4 py-2 flex items-center gap-4 text-[10px] text-zinc-400 dark:text-zinc-600">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
