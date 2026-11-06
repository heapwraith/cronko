import { groupHeartbeatsByDay } from "@cronko/shared"
import { useState } from "react"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card"
import { useT } from "@/lib/i18n"

const PERIODS = [
  { days: 30, label: "30d" },
  { days: 60, label: "60d" },
  { days: 90, label: "90d" },
]

export function HeartbeatHistory({
  heartbeats,
}: {
  heartbeats: Array<{
    receivedAt: string
    durationMs: number | null
  }>
}) {
  const { t } = useT()
  const [period, setPeriod] = useState(90)

  const heartbeatsTyped = heartbeats.map((hb) => ({
    id: "",
    monitorId: "",
    receivedAt: new Date(hb.receivedAt),
    sourceIp: null as string | null,
    userAgent: null as string | null,
    durationMs: hb.durationMs,
    exitCode: null as number | null,
  }))

  const days = groupHeartbeatsByDay(heartbeatsTyped, period)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("monitor.heartbeatHistory")}</CardTitle>
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              aria-pressed={period === p.days}
              aria-label={t("monitor.heatmapShowDays", { n: p.days })}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                period === p.days
                  ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                  : "text-zinc-500 hover:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardBody>
        <div
          className="flex flex-wrap gap-0.5"
          role="grid"
          aria-label={t("monitor.heatmapCalendarLabel")}
        >
          {Array.from(days.entries()).map(([date, hbs]) => {
            const today = new Date().toISOString().split("T")[0]
            const isToday = date === today
            const healthy = hbs.length > 0
            const tardy =
              healthy &&
              hbs.some(
                (hb) =>
                  "durationMs" in hb &&
                  hb.durationMs !== null &&
                  hb.durationMs !== undefined &&
                  hb.durationMs > 0,
              )

            let color = "bg-zinc-200 dark:bg-zinc-800"
            let level = 0

            if (healthy && !tardy) {
              const count = hbs.length
              if (count >= 8) {
                color = "bg-emerald-700"
                level = 4
              } else if (count >= 4) {
                color = "bg-emerald-600"
                level = 3
              } else if (count >= 2) {
                color = "bg-emerald-500"
                level = 2
              } else {
                color = "bg-emerald-400"
                level = 1
              }
            } else if (healthy && tardy) {
              color = "bg-amber-500"
              level = -1
            } else if (hbs.length > 0) {
              color = "bg-red-600"
              level = -2
            }

            const tooltipParts: string[] = [date]
            if (level > 0) tooltipParts.push(`${hbs.length} ping${hbs.length !== 1 ? "s" : ""}`)
            else if (level === -1) tooltipParts.push(t("monitor.heatmapLate").toLowerCase())
            else if (level === -2) tooltipParts.push(t("monitor.heatmapMissed").toLowerCase())
            else tooltipParts.push(t("monitor.heatmapNoData").toLowerCase())

            return (
              <div
                key={date}
                role="gridcell"
                title={tooltipParts.join(": ")}
                aria-label={tooltipParts.join(": ")}
                className={`h-3.5 w-3.5 rounded-sm ${color} transition-colors ${
                  isToday
                    ? "ring-1 ring-zinc-400 dark:ring-zinc-500 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900"
                    : ""
                }`}
              />
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-3" aria-label="Legend">
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <span className="h-3 w-3 rounded-sm bg-emerald-700 inline-block" aria-hidden="true" />
            <span className="h-3 w-3 rounded-sm bg-emerald-600 inline-block" aria-hidden="true" />
            <span className="h-3 w-3 rounded-sm bg-emerald-500 inline-block" aria-hidden="true" />
            <span className="h-3 w-3 rounded-sm bg-emerald-400 inline-block" aria-hidden="true" />
            {t("monitor.heatmapMany")}
          </div>
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <span className="h-3 w-3 rounded-sm bg-amber-500 inline-block" aria-hidden="true" />
            {t("monitor.heatmapLate")}
          </div>
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <span className="h-3 w-3 rounded-sm bg-red-600 inline-block" aria-hidden="true" />
            {t("monitor.heatmapMissed")}
          </div>
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <span
              className="h-3 w-3 rounded-sm bg-zinc-200 dark:bg-zinc-800 inline-block"
              aria-hidden="true"
            />
            {t("monitor.heatmapNoData")}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
