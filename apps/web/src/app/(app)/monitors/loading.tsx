import { SkeletonTable } from "@/components/shared/Skeleton"

export default function MonitorsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 animate-pulse rounded-md bg-zinc-800/60" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-zinc-800/60" />
      </div>
      <SkeletonTable rows={5} cols={5} />
    </div>
  )
}
