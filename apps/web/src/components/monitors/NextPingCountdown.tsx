import { useEffect, useState } from "react"

interface NextPingCountdownProps {
  lastPingIso: string | null
  intervalSeconds: number
}

export function NextPingCountdown({ lastPingIso, intervalSeconds }: NextPingCountdownProps) {
  const [label, setLabel] = useState("—")

  useEffect(() => {
    if (!lastPingIso) {
      setLabel("—")
      return
    }

    const lastMs = new Date(lastPingIso).getTime()

    function tick() {
      const nextMs = lastMs + intervalSeconds * 1000
      const remaining = Math.max(0, Math.floor((nextMs - Date.now()) / 1000))

      if (remaining <= 0) {
        setLabel("due now")
        return
      }

      const h = Math.floor(remaining / 3600)
      const m = Math.floor((remaining % 3600) / 60)
      const s = remaining % 60

      if (h > 0) setLabel(`in ${h}h ${m}m`)
      else if (m > 0) setLabel(`in ${m}m ${s}s`)
      else setLabel(`in ${s}s`)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lastPingIso, intervalSeconds])

  return <span className="tabular-nums">{label}</span>
}
