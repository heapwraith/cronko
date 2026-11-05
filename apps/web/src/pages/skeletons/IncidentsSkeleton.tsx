import { SkeletonTable } from "@/components/shared/Skeleton"

export default function IncidentsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-24 animate-pulse rounded-md bg-zinc-800/60" />
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-7 w-20 animate-pulse rounded-lg bg-zinc-800/60" />
        ))}
      </div>
      <SkeletonTable rows={5} cols={5} />
    </div>
  )
}
