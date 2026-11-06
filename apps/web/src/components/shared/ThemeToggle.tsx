import { Moon, Sun } from "lucide-react"
import { IconButton } from "@/components/shared/IconButton"
import { useTheme } from "@/components/shared/ThemeProvider"
import { useT } from "@/lib/i18n"

/** Light/dark switch for pages outside the app shell (login, public status). */
export function ThemeToggle() {
  const { t } = useT()
  const { theme, setTheme } = useTheme()
  const dark = theme === "dark"
  const label = dark ? t("auth.switchToLight") : t("auth.switchToDark")
  return (
    <IconButton
      label={label}
      onClick={(e) => {
        const origin = (window as Window & { __cronkoSetOrigin?: (x: number, y: number) => void })
          .__cronkoSetOrigin
        origin?.(e.clientX, e.clientY)
        setTheme(dark ? "light" : "dark")
      }}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </IconButton>
  )
}
