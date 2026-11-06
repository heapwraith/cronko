import { Maximize2, Minimize2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useT } from "@/lib/i18n"
import { IconButton } from "./IconButton"

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

  const label = compact ? t("ui.normalDensity") : t("ui.compactMode")
  return (
    <IconButton label={label} onClick={toggle} aria-pressed={compact}>
      {compact ? (
        <Maximize2 className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Minimize2 className="h-4 w-4" strokeWidth={1.75} />
      )}
    </IconButton>
  )
}
