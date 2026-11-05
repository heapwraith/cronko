"use client"

import { useT } from "@/lib/i18n"

interface Segment {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segments: Segment[]
  total: number
  size?: number
}

export function DonutChart({ segments, total, size = 100 }: DonutChartProps) {
  const { t } = useT()
  const radius = size / 2 - 8
  const circumference = 2 * Math.PI * radius
  const strokeWidth = 10

  let offset = 0

  return (
    <div className="flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {segments.map((seg) => {
          const percent = total > 0 ? seg.value / total : 0
          const dashLength = circumference * percent
          const segment = (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-offset}
              className="transition-all duration-700 ease-out"
              style={{
                strokeDashoffset: -offset,
              }}
            />
          )
          offset += dashLength
          return segment
        })}

        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-zinc-100 dark:fill-zinc-100 font-semibold"
          style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
        >
          <tspan
            x={size / 2}
            dy="-0.3em"
            className="text-lg"
            style={{ fontSize: "16px", fontWeight: 600 }}
          >
            {total}
          </tspan>
          <tspan
            x={size / 2}
            dy="1.2em"
            className="text-xs fill-zinc-500"
            style={{ fontSize: "10px" }}
          >
            {total !== 1 ? t("ui.monitorPlural") : t("ui.monitorSingular")}
          </tspan>
        </text>
      </svg>
    </div>
  )
}
