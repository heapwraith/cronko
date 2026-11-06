import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  resolved: "dark" | "light"
}
const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}
function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light"
  return (localStorage.getItem("cronko_theme") as Theme) ?? "dark"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark")
  const [resolved, setResolved] = useState<"dark" | "light">("dark")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = getStoredTheme()
    const effective = stored === "system" ? getSystemTheme() : stored
    setThemeState(stored)
    setResolved(effective)
    document.documentElement.classList.toggle("dark", effective === "dark")
    setMounted(true)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    const effective = t === "system" ? getSystemTheme() : t

    if (document.startViewTransition) {
      document.startViewTransition(() => {
        document.documentElement.classList.toggle("dark", effective === "dark")
      })
    } else {
      document.documentElement.classList.toggle("dark", effective === "dark")
    }

    setThemeState(t)
    setResolved(effective)
    if (typeof window !== "undefined") localStorage.setItem("cronko_theme", t)
  }, [])

  useEffect(() => {
    ;(window as Window & { __cronkoSetOrigin?: (x: number, y: number) => void }).__cronkoSetOrigin =
      (x: number, y: number) => {
        document.documentElement.style.setProperty("--tx", `${(x / window.innerWidth) * 100}%`)
        document.documentElement.style.setProperty("--ty", `${(y / window.innerHeight) * 100}%`)
      }
  }, [])

  useEffect(() => {
    if (!mounted) return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const h = () => {
      if (theme === "system") {
        const s = getSystemTheme()
        setResolved(s)
        document.documentElement.classList.toggle("dark", s === "dark")
      }
    }
    mq.addEventListener("change", h)
    return () => mq.removeEventListener("change", h)
  }, [theme, mounted])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider")
  return ctx
}
