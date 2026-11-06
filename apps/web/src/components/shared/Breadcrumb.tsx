import { ChevronRight } from "lucide-react"
import { Link } from "react-router"
import { useT } from "@/lib/i18n"

interface Crumb {
  label: string
  href?: string
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  const { t } = useT()
  return (
    <nav aria-label={t("breadcrumb.label")}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-dim">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={item.label} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
              {item.href && !isLast ? (
                <Link
                  to={item.href}
                  className="underline-offset-4 hover:text-ink hover:underline focus-visible:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "text-ink" : ""}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
