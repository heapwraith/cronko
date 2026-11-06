import type { ReactNode } from "react"

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-raised ${className}`} />
}

export function SkeletonCard({ children }: { children?: ReactNode }) {
  return (
    <div aria-hidden="true" className="border-t border-line pt-4">
      {children ?? (
        <>
          <Skeleton className="mb-3 h-3 w-24" />
          <Skeleton className="h-7 w-16" />
        </>
      )}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading">
      <div className="flex gap-4 border-b-2 border-line-strong px-3 py-3">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={`h${c}`} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={`r${r}`} className="flex gap-4 border-b border-line px-3 py-4 last:border-b-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={`c${c}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }, (_, r) => (
        <Skeleton key={`l${r}`} className="h-12 w-full" />
      ))}
    </div>
  )
}
