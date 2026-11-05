import { SkeletonCard, SkeletonTable } from "@/components/shared/Skeleton"

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 animate-pulse rounded-md bg-zinc-800/60" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      <SkeletonTable rows={5} cols={5} />
    </div>
  )
}
