import { X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { useT } from "@/lib/i18n"
import { IconButton } from "./IconButton"

const GO: Record<string, string> = {
  d: "/dashboard",
  m: "/monitors",
  i: "/incidents",
  n: "/notifications",
  s: "/settings",
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null
  return !!t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable)
}

/** Single-key navigation (D M I N S) and the `?` cheat sheet. */
export function KeyboardShortcuts() {
  const { t } = useT()
  const navigate = useNavigate()
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      // Another dialog (command palette, confirm) owns the keyboard while open.
      if (document.querySelector("dialog[open]") && !ref.current?.open) return
      if (e.key === "?") {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      const to = GO[e.key.toLowerCase()]
      if (to) {
        e.preventDefault()
        navigate(to)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navigate])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const rows: { keys: string[]; label: string }[] = [
    { keys: ["Ctrl", "K"], label: t("shortcuts.palette") },
    { keys: ["D"], label: t("cmd.goTo", { page: t("nav.dashboard") }) },
    { keys: ["M"], label: t("cmd.goTo", { page: t("nav.monitors") }) },
    { keys: ["I"], label: t("cmd.goTo", { page: t("nav.incidents") }) },
    { keys: ["N"], label: t("cmd.goTo", { page: t("nav.notifications") }) },
    { keys: ["S"], label: t("cmd.goTo", { page: t("nav.settings") }) },
    { keys: ["?"], label: t("shortcuts.show") },
  ]

  return (
    <dialog
      ref={ref}
      onClose={() => setOpen(false)}
      aria-labelledby="shortcuts-title"
      className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-[6px] border border-line-strong bg-panel p-0 text-ink shadow-[0_18px_48px_-12px_rgb(0_0_0/0.6)] backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <h2 id="shortcuts-title" className="text-base font-semibold">
          {t("shortcuts.title")}
        </h2>
        <IconButton label={t("shortcuts.close")} onClick={() => setOpen(false)}>
          <X className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>
      <dl className="space-y-2.5 p-4 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <dt className="text-dim">{r.label}</dt>
            <dd className="flex gap-1">
              {r.keys.map((k) => (
                <kbd
                  key={k}
                  className="rounded-[4px] border border-line-strong bg-raised px-2 py-0.5 font-mono text-xs"
                >
                  {k}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </dialog>
  )
}
