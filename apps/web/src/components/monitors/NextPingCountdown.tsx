import { formatDuration } from "@cronko/shared/utils"
import { useEffect, useState } from "react"
import { useT } from "@/lib/i18n"

/** Time until the next ping is due (or how late it is), in the UI language. */
export function NextPingCountdown({ dueIso }: { dueIso: string | null }) {
  const { t } = useT()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!dueIso) return <span>—</span>

  const due = new Date(dueIso).getTime()
  const time = formatDuration(Math.abs(due - now))
  return (
    <span className="tnum">
      {due >= now ? t("board.in", { time }) : t("board.overdue", { time })}
    </span>
  )
}
