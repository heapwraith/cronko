import { Check, CircleDashed, OctagonX, Pause, TriangleAlert, X } from "lucide-react"

export type StampTone = "healthy" | "missed" | "down" | "failed" | "paused" | "pending"

const TONE: Record<
  StampTone,
  { color: string; Glyph: React.ComponentType<{ className?: string }>; dashed?: boolean }
> = {
  healthy: { color: "bg-[var(--chip-healthy-bg)] text-[var(--chip-healthy-fg)]", Glyph: Check },
  missed: {
    color: "bg-[var(--chip-missed-bg)] text-[var(--chip-missed-fg)]",
    Glyph: TriangleAlert,
  },
  down: { color: "bg-[var(--chip-down-bg)] text-[var(--chip-down-fg)]", Glyph: OctagonX },
  failed: { color: "bg-[var(--chip-failed-bg)] text-[var(--chip-failed-fg)]", Glyph: X },
  paused: { color: "bg-[var(--chip-paused-bg)] text-[var(--chip-paused-fg)]", Glyph: Pause },
  pending: {
    color: "bg-[var(--chip-pending-bg)] text-[var(--chip-pending-fg)]",
    Glyph: CircleDashed,
    dashed: true,
  },
}

/**
 * The state mark: a tinted pill with a drawn glyph and a word. Colour only
 * confirms; the glyph shape and the word carry the meaning (greyscale-safe).
 */
export function Stamp({ tone, label }: { tone: StampTone; label: string }) {
  const { color, Glyph, dashed } = TONE[tone]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        dashed ? "ring-1 ring-current/30 ring-inset" : ""
      } ${color}`}
    >
      <Glyph className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  )
}
