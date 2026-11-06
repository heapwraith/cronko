import { LogOut, Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { NavLink, useNavigate } from "react-router"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { CompactToggle } from "./CompactToggle"
import { CronkoLogo } from "./CronkoLogo"
import { IconButton } from "./IconButton"
import { useTheme } from "./ThemeProvider"

/** Date and time for the logbook masthead, refreshed four times a minute. */
function Masthead() {
  const { locale } = useT()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  const date = now.toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "short" })
  const time = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
  return (
    <time
      dateTime={now.toISOString()}
      className="hidden items-baseline gap-2 whitespace-nowrap text-sm text-dim sm:flex"
    >
      <span>{date}</span>
      <span className="font-mono text-base font-medium text-ink tnum">{time}</span>
    </time>
  )
}

function ThemeToggle() {
  const { t } = useT()
  const { theme, setTheme } = useTheme()
  const dark = theme === "dark"
  const label = dark ? t("auth.switchToLight") : t("auth.switchToDark")

  const onClick = (e: React.MouseEvent) => {
    const origin = (window as Window & { __cronkoSetOrigin?: (x: number, y: number) => void })
      .__cronkoSetOrigin
    origin?.(e.clientX, e.clientY)
    setTheme(dark ? "light" : "dark")
  }

  return (
    <IconButton label={label} onClick={onClick}>
      {dark ? (
        <Sun className="h-4 w-4" strokeWidth={1.75} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.75} />
      )}
    </IconButton>
  )
}

function LogoutButton() {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <IconButton
      label={t("nav.logout")}
      className="hover:text-down"
      onClick={async () => {
        try {
          await api.auth.logout()
        } catch {
          // logout is best-effort: the cookie is cleared server-side when it succeeds
        }
        navigate("/login")
      }}
    >
      <LogOut className="h-4 w-4" strokeWidth={1.75} />
    </IconButton>
  )
}

export function TopBar({ instanceName, email }: { instanceName?: string; email?: string }) {
  const { t } = useT()

  const tabs = [
    { to: "/dashboard", label: t("nav.dashboard") },
    { to: "/monitors", label: t("nav.monitors") },
    { to: "/incidents", label: t("nav.incidents") },
    { to: "/notifications", label: t("nav.notifications") },
    { to: "/settings", label: t("nav.settings") },
    { to: "/how-to-use", label: t("nav.howto") },
  ]

  return (
    <header className="sticky top-0 z-30 border-b border-line-strong bg-ground">
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-2.5 sm:px-8">
        <NavLink to="/dashboard" className="flex items-center gap-2.5" aria-label="Cronko">
          <CronkoLogo className="h-6 w-6 text-ink" />
          <span className="font-serif text-xl font-medium tracking-tight text-ink">
            {instanceName ?? "Cronko"}
          </span>
        </NavLink>

        <span className="flex-1" />

        <Masthead />
        {email && (
          <span className="hidden max-w-48 truncate text-sm text-dim lg:block" title={email}>
            {email}
          </span>
        )}
        <div className="flex items-center">
          <ThemeToggle />
          <CompactToggle />
          <LogoutButton />
        </div>
      </div>

      <nav aria-label="Principal" className="border-t border-line">
        <ul className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-2 sm:px-6">
          {tabs.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `relative flex items-center whitespace-nowrap px-3 py-2.5 focus-visible:outline-offset-[-2px] text-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 ${
                    isActive
                      ? "text-ink after:bg-ink"
                      : "text-dim after:bg-transparent hover:text-ink"
                  }`
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
