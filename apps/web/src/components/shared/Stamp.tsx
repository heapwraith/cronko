import { Check, CircleDashed, OctagonX, Pause, TriangleAlert, X } from "lucide-react"

export type StampTone = "healthy" | "missed" | "down" | "failed" | "paused" | "pending"

const TONE: Record<
  StampTone,
  { color: string; Glyph: React.ComponentType<{ className?: string }>; dashed?: boolean }
> = {
  healthy: { color: "text-healthy border-healthy", Glyph: Check },
  missed: { color: "text-missed border-missed", Glyph: TriangleAlert },
  down: { color: "text-down border-down", Glyph: OctagonX },
  failed: { color: "text-failed border-failed", Glyph: X },
  paused: { color: "text-paused border-paused", Glyph: Pause },
  pending: { color: "text-pending border-pending", Glyph: CircleDashed, dashed: true },
}

/**
 * The state mark: an outlined stamp with a drawn glyph and a word. Colour only
 * confirms; the glyph shape and the word carry the meaning (greyscale-safe).
 */
export function Stamp({ tone, label }: { tone: StampTone; label: string }) {
  const { color, Glyph, dashed } = TONE[tone]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[2px] border bg-transparent px-1.5 py-0.5 text-xs font-semibold ${
        dashed ? "border-dashed" : ""
      } ${color}`}
    >
      <Glyph className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  )
}
