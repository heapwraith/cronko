import { useEffect, useRef, useState } from "react"
import { useT } from "@/lib/i18n"
import { Button } from "./Button"

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard needs a secure context; the URL stays selectable in the page.
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={copy} aria-live="polite">
      {copied ? t("detail.copied") : (label ?? t("detail.copy"))}
    </Button>
  )
}
