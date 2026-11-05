"use client"

import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { CompactToggle } from "./CompactToggle"
import { CronkoLogo } from "./CronkoLogo"
import { NavLink } from "./NavLink"
import { useTheme } from "./ThemeProvider"
import { UserAvatar } from "./UserAvatar"

function ThemeToggle() {
  const { t } = useT()
  const { theme, setTheme } = useTheme()
  const next = theme === "dark" ? "light" : ("dark" as const)
  const Icon = theme === "dark" ? Sun : Moon
  const label = theme === "dark" ? t("auth.switchToLight") : t("auth.switchToDark")

  const handleClick = (e: React.MouseEvent) => {
    const fn = (window as Window & { __cronkoSetOrigin?: (x: number, y: number) => void })
      .__cronkoSetOrigin
    if (fn) fn(e.clientX, e.clientY)
    setTheme(next)
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-center h-8 w-8 rounded-lg text-[#697386] dark:text-zinc-400 hover:text-[#1a1f36] dark:hover:text-zinc-200 hover:bg-[#efede9] dark:hover:bg-zinc-800 transition-all duration-200"
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} />
    </button>
  )
}

function LogoutButton() {
  const { t } = useT()
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        try {
          await api.auth.logout()
        } catch {
          /* logout best-effort */
        }
        router.push("/login")
      }}
      className="flex items-center justify-center h-8 w-8 rounded-lg text-[#697386] dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all duration-200"
      title={t("nav.logout")}
      aria-label={t("nav.logout")}
    >
      <LogOut className="h-4 w-4" strokeWidth={1.5} />
    </button>
  )
}

export function Sidebar({ instanceName }: { instanceName?: string }) {
  const { t } = useT()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const items = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/monitors", label: t("nav.monitors"), icon: Activity },
    { href: "/how-to-use", label: t("nav.howto"), icon: BookOpen },
    { href: "/incidents", label: t("nav.incidents"), icon: AlertTriangle },
    { href: "/notifications", label: t("nav.notifications"), icon: Bell },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ]

  const footer = (
    <div className="border-t border-zinc-200 dark:border-zinc-800/80">
      {collapsed ? (
        <div className="flex flex-col items-center gap-3 py-3">
          <UserAvatar collapsed />
          <ThemeToggle />
          <CompactToggle />
          <LogoutButton />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 mx-1.5 px-3 py-2">
          <UserAvatar compact />
          <span className="flex-1" />
          <ThemeToggle />
          <CompactToggle />
          <LogoutButton />
        </div>
      )}
    </div>
  )

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 rounded-lg bg-white dark:bg-zinc-900 shadow-sm dark:shadow-none p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        aria-label={t("nav.expand")}
      >
        <Menu className="h-5 w-5" strokeWidth={1.5} />
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`hidden lg:flex shrink-0 shadow-[1px_0_3px_rgba(0,0,0,0.04)] dark:shadow-[1px_0_3px_rgba(0,0,0,0.2)] bg-[#fbfbfa]/95 dark:bg-zinc-900/80 backdrop-blur-xl flex-col transition-all duration-300 ${
          collapsed ? "w-16" : "w-56"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Header */}
        <div
          className={`flex items-center px-4 py-4 border-b border-zinc-200 dark:border-zinc-800/80 ${collapsed ? "justify-center" : "justify-between"}`}
        >
          {collapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              className="flex items-center justify-center h-8 w-8 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title={t("nav.expand")}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            </button>
          ) : (
            <>
              <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
                <CronkoLogo className="h-5 w-5 text-emerald-400 shrink-0" />
                <span className="font-semibold text-sm truncate text-zinc-900 dark:text-zinc-100">
                  {instanceName ?? "Cronko"}
                </span>
              </Link>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCollapsed(true)}
                  className="hidden lg:flex items-center justify-center h-6 w-6 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                  title={t("nav.collapse")}
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="lg:hidden flex items-center justify-center h-6 w-6 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 space-y-0.5">
          {items.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={collapsed ? "" : item.label}
              collapsed={collapsed}
            >
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        {footer}
      </aside>

      {/* Mobile drawer */}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-56 shadow-[1px_0_3px_rgba(0,0,0,0.04)] dark:shadow-[1px_0_3px_rgba(0,0,0,0.2)] bg-[#fbfbfa]/95 dark:bg-zinc-900/90 backdrop-blur-xl flex flex-col transition-transform ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          transitionDuration: "300ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-200 dark:border-zinc-800/80">
          <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
            <CronkoLogo className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-sm truncate text-zinc-900 dark:text-zinc-100">
              {instanceName ?? "Cronko"}
            </span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center h-6 w-6 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        <nav className="flex-1 py-2 space-y-0.5">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label}>
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            </NavLink>
          ))}
        </nav>
        {footer}
      </aside>
    </>
  )
}
