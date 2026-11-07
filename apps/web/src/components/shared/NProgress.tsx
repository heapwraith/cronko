import { useIsFetching } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useNavigation } from "react-router"

/** Wait this long before showing the bar, so loads that finish at once never flash it. */
const SHOW_AFTER_MS = 150
const TRICKLE_MS = 250
/** How long the finished bar stays so the "done" step is seen, then it fades out. */
const FINISH_MS = 300

/**
 * A top progress bar driven by real work, not a timer: it runs while a route is loading
 * (lazy page chunks) or while a query that has no data yet is fetching. Background
 * refreshes of data already on screen (window focus, polling) never show it.
 */
export function NProgress() {
  const navigation = useNavigation()
  const loadingQueries = useIsFetching({ predicate: (q) => q.state.data === undefined })
  const busy = navigation.state !== "idle" || loadingQueries > 0

  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  // The bar is on screen: growing, or filled and fading out.
  const shown = useRef(false)
  // The fade-out timer outlives the effect that started it: if more work begins while the bar
  // is fading, that effect re-runs, and it must not be the one to cancel the way out.
  const timers = useRef<{ show?: number; hide?: number; trickle?: number }>({})

  useEffect(() => {
    const t = timers.current
    if (busy) {
      // Work resumed while the bar was fading: keep it, and take it off the "full" mark.
      window.clearTimeout(t.hide)
      if (shown.current) setWidth((w) => (w >= 100 ? 20 : w))
      else {
        t.show = window.setTimeout(() => {
          shown.current = true
          setVisible(true)
          setWidth(10)
        }, SHOW_AFTER_MS)
      }
      // Creep toward 90% but never reach it: only real completion fills the bar.
      t.trickle = window.setInterval(() => {
        if (shown.current) setWidth((w) => w + (90 - w) * 0.12)
      }, TRICKLE_MS)
      return () => {
        window.clearTimeout(t.show)
        window.clearInterval(t.trickle)
      }
    }
    if (shown.current) {
      // The work finished: fill the bar, then let it go.
      setWidth(100)
      t.hide = window.setTimeout(() => {
        shown.current = false
        setVisible(false)
        setWidth(0)
      }, FINISH_MS)
    }
  }, [busy])

  useEffect(() => () => window.clearTimeout(timers.current.hide), [])

  return (
    <div
      aria-hidden="true"
      data-testid="nprogress"
      data-active={visible}
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-0.5 w-full"
    >
      <div
        className="h-full origin-left transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `${width}%`, opacity: visible ? 1 : 0, background: "var(--signal)" }}
      />
    </div>
  )
}
