"use client"

import { ChevronRight } from "lucide-react"
import Link from "next/link"

interface Crumb {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: Crumb[]
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-xs text-[#697386] dark:text-zinc-500"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-[#8e99a8] dark:text-zinc-600" />}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-[#1a1f36] dark:hover:text-zinc-300 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-[#1a1f36] dark:text-zinc-400" : ""}>
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
