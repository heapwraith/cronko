"use client"

interface ResponseTimeChartProps {
  heartbeats: Array<{
    receivedAt: string
    durationMs: number | null
  }>
}

export function ResponseTimeChart({ heartbeats }: ResponseTimeChartProps) {
  const hbsWithDuration = heartbeats
    .filter((hb) => hb.durationMs !== null && hb.durationMs !== undefined && hb.durationMs > 0)
    .reverse()
    .slice(-30)

  if (hbsWithDuration.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-zinc-600">
        Not enough data for response time chart
      </div>
    )
  }

  const values = hbsWithDuration.map((hb) => hb.durationMs!)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100
    const y = 100 - ((v - min) / range) * 80 - 10
    return `${x},${y}`
  })

  const avg = values.reduce((sum, v) => sum + v, 0) / values.length
  const sorted = [...values].sort((a, b) => a - b)
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  return (
    <div>
      <div className="relative h-32 w-full">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          {/* Grid lines */}
          {[25, 50, 75].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="rgb(63 63 70)"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
          ))}

          {/* Area fill */}
          <polygon
            points={`0,100 ${points.join(" ")} 100,100`}
            fill="url(#gradient)"
            opacity="0.3"
          />

          {/* Line */}
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke="rgb(52 211 153)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots */}
          {points.map((p, i) => {
            const [x, y] = p.split(",").map(Number)
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="1.5"
                fill="rgb(52 211 153)"
                className="opacity-0 hover:opacity-100 transition-opacity"
              />
            )
          })}

          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(52 211 153)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Avg</p>
          <p className="text-xs font-medium text-zinc-300">{formatMs(avg)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">P50</p>
          <p className="text-xs font-medium text-zinc-300">{formatMs(p50)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">P95</p>
          <p className="text-xs font-medium text-zinc-300">{formatMs(p95)}</p>
        </div>
      </div>
    </div>
  )
}
