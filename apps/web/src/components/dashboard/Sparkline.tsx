interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  className?: string
}

export function Sparkline({
  data,
  color = "rgb(52 211 153)", // emerald-400
  height = 40,
  className = "",
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <div className={`flex items-end justify-center ${className}`} style={{ height }}>
        <span className="text-xs text-zinc-600">No data</span>
      </div>
    )
  }

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const width = 100
  const padding = 2

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2)
    const y = height - padding - ((v - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  const areaPoints = `0,${height} ${points.join(" ")} ${width},${height}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`w-full overflow-visible ${className}`}
      style={{ height }}
    >
      {/* Area fill */}
      <polygon points={areaPoints} fill={color} fillOpacity="0.15" />

      {/* Line */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Last point dot */}
      {data.length > 0 &&
        (() => {
          const lastPoint = points[points.length - 1]
          const [cx, cy] = lastPoint?.split(",") ?? []
          return <circle cx={cx ?? "0"} cy={cy ?? "0"} r="2" fill={color} />
        })()}
    </svg>
  )
}
