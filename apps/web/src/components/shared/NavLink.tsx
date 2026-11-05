"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

export function NavLink({
  href,
  label,
  children,
  collapsed = false,
}: {
  href: string
  label: string
  children: ReactNode
  collapsed?: boolean
}) {
  const pathname = usePathname()
  const isActive = pathname.startsWith(href)

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-current={isActive ? "page" : undefined}
      className={`relative flex items-center gap-2.5 mx-1.5 px-3 py-2 text-[13px] rounded-md transition-colors ${
        collapsed ? "justify-center" : ""
      } ${
        isActive
          ? "bg-[#edece7] dark:bg-zinc-800 text-[#1a1f36] dark:text-zinc-100 font-medium"
          : "text-[#697386] dark:text-zinc-400 hover:text-[#1a1f36] dark:hover:text-zinc-200 hover:bg-[#efede9] dark:hover:bg-zinc-800/50"
      }`}
    >
      {/* Active indicator bar — Arc Browser style */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.75 h-5 rounded-r-full bg-[#5e6ad2]" />
      )}
      {children}
      {!collapsed && <span className="leading-none">{label}</span>}
    </Link>
  )
}
