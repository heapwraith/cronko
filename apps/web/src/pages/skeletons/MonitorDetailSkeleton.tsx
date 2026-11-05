export default function MonitorDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-6 w-48 animate-pulse rounded-md bg-zinc-800/60" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-zinc-800/60" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-7 w-16 animate-pulse rounded-lg bg-zinc-800/60" />
          ))}
        </div>
      </div>

      {/* Ping URL card */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900">
        <div className="border-b border-zinc-800/80 px-4 py-3">
          <div className="h-3 w-16 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="p-4">
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-zinc-800/60" />
        </div>
      </div>

      {/* Stats card */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900">
        <div className="border-b border-zinc-800/80 px-4 py-3">
          <div className="h-3 w-10 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="p-4 grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-800/60 mb-2" />
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-800/60" />
            </div>
          ))}
        </div>
      </div>

      {/* Chart placeholder */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900">
        <div className="border-b border-zinc-800/80 px-4 py-3">
          <div className="h-3 w-28 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="p-4">
          <div className="h-32 w-full animate-pulse rounded-lg bg-zinc-800/60" />
        </div>
      </div>

      {/* Heartbeat grid placeholder */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900">
        <div className="border-b border-zinc-800/80 px-4 py-3">
          <div className="h-3 w-40 animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-0.5">
            {Array.from({ length: 90 }).map((_, i) => (
              <div key={i} className="h-3 w-3 rounded-sm animate-pulse bg-zinc-800/60" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
