import { type ReactNode, useEffect, useRef, useState } from "react"

interface TooltipProps {
  content: string
  children: ReactNode
  delay?: number
}

export function Tooltip({ content, children, delay = 500 }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<"top" | "bottom">("top")
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLSpanElement>(null)

  const show = () => {
    timeoutRef.current = setTimeout(() => {
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect()
        setPosition(rect.top < 60 ? "bottom" : "top")
      }
      setVisible(true)
    }, delay)
  }

  const hide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          className={`absolute left-1/2 -translate-x-1/2 z-50 px-2 py-1 rounded-md bg-zinc-800 dark:bg-zinc-800 bg-white dark:border-zinc-700 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap shadow-lg pointer-events-none animate-in fade-in zoom-in-95 ${
            position === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {content}
        </span>
      )}
    </span>
  )
}
