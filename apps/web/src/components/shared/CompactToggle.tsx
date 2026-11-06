import { Maximize2, Minimize2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useT } from "@/lib/i18n"

const STORAGE_KEY = "cronko_compact"

export function CompactToggle() {
  const { t } = useT()
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) === "true"
    setCompact(stored)
    document.documentElement.classList.toggle("compact", stored)
  }, [])

  const toggle = () => {
    const next = !compact
    setCompact(next)
    localStorage.setItem(STORAGE_KEY, String(next))
    document.documentElement.classList.toggle("compact", next)
    window.dispatchEvent(new Event("compactchange"))
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center h-8 w-8 rounded-lg text-[#697386] dark:text-zinc-400 hover:text-[#1a1f36] dark:hover:text-zinc-200 hover:bg-[#efede9] dark:hover:bg-zinc-800 transition-all duration-200"
      title={compact ? t("ui.normalDensity") : t("ui.compactMode")}
      aria-label={compact ? t("ui.normalDensity") : t("ui.compactMode")}
    >
      {compact ? (
        <Maximize2 className="h-4 w-4" strokeWidth={1.5} />
      ) : (
        <Minimize2 className="h-4 w-4" strokeWidth={1.5} />
      )}
    </button>
  )
}
