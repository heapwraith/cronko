import type { MonitorStatus } from "@cronko/shared/types"
import type { ReactNode } from "react"

interface CardProps {
  children: ReactNode
  className?: string
  glass?: boolean
  status?: MonitorStatus
  hover?: boolean
}

const statusGradients: Record<string, string> = {
  healthy: "bg-gradient-to-br from-emerald-500/5 to-transparent",
  missed: "bg-gradient-to-br from-amber-500/5 to-transparent",
  down: "bg-gradient-to-br from-red-500/5 to-transparent",
  failed: "bg-gradient-to-br from-rose-500/5 to-transparent",
  paused: "bg-gradient-to-br from-zinc-500/5 to-transparent",
}

const statusBorders: Record<string, string> = {
  down: "border-red-500/20 animate-pulse-border",
}

export function Card({ children, className = "", glass = false, status, hover = true }: CardProps) {
  const base =
    "rounded-xl border border-[#e8eaed] dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm dark:shadow-none transition-all duration-300"
  const glassClass = glass
    ? "backdrop-blur-xl bg-white/80 dark:bg-zinc-900/70 border-[#e8eaed]/50 dark:border-zinc-800/50"
    : ""
  const hoverClass = hover
    ? "hover:shadow-md dark:hover:shadow-lg hover:border-[#dde0e4] dark:hover:border-zinc-700/80"
    : ""
  const gradientClass = status ? (statusGradients[status] ?? "") : ""
  const borderClass = status ? (statusBorders[status] ?? "") : ""

  return (
    <div
      className={`${base} ${glassClass} ${hoverClass} ${gradientClass} ${borderClass} ${hover ? "shine" : ""} ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`border-b border-[#e8eaed] dark:border-zinc-800/80 px-5 py-3.5 flex items-center justify-between ${className}`}
    >
      {children}
    </div>
  )
}

export function CardTitle({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <h3
      className={`text-xs uppercase tracking-wider text-[#697386] dark:text-zinc-500 font-medium ${className}`}
    >
      {children}
    </h3>
  )
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`p-5 ${className}`}>{children}</div>
}
