"use client"

import { Command, X } from "lucide-react"
import { useEffect, useState } from "react"

const shortcuts = [
  { keys: ["Ctrl", "K"], label: "Command palette" },
  { keys: ["D"], label: "Go to Dashboard" },
  { keys: ["M"], label: "Go to Monitors" },
  { keys: ["I"], label: "Go to Incidents" },
  { keys: ["N"], label: "Go to Notifications" },
  { keys: ["S"], label: "Go to Settings" },
  { keys: ["?"], label: "Show shortcuts" },
]

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT"
        )
          return
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-61 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-sm rounded-xl border border-[#e8eaed] dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-2xl animate-in zoom-in-95 fade-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e8eaed] dark:border-zinc-800/80">
          <h2 className="text-sm font-semibold text-[#1a1f36] dark:text-zinc-100">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-[#697386] dark:text-zinc-400 hover:bg-[#f4f2ee] dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-2">
          {shortcuts.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-sm">
              <span className="text-[#697386] dark:text-zinc-400">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-2 py-0.5 text-[10px] font-mono font-medium bg-[#f4f2ee] dark:bg-zinc-800 text-[#697386] dark:text-zinc-400 rounded-md"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
