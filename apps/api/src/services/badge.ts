/**
 * Status badges: SVG, plain JSON and the shields.io endpoint schema.
 *
 * Nothing here ever receives a monitor name, token or id: a badge carries a label
 * (a fixed word or a tag), a state word and a colour, and nothing else.
 */
import { overallState, type PublicState, publicState } from "@cronko/shared/status"

export type BadgeFormat = "svg" | "json" | "shields"

/**
 * Background colours chosen so white text passes WCAG AA (4.5:1) on every one of them
 * (the old palette, emerald-500 and amber-500, was about 2.5:1 and 2.1:1).
 */
export const BADGE_COLORS = {
  green: "#047857",
  amber: "#b45309",
  red: "#b91c1c",
  gray: "#4b5563",
  blue: "#1d4ed8",
  label: "#374151",
} as const

/** The colour names shields.io understands, matching the palette above. */
const SHIELDS_COLOR: Record<keyof typeof BADGE_COLORS, string> = {
  green: "green",
  amber: "orange",
  red: "red",
  gray: "lightgrey",
  blue: "blue",
  label: "grey",
}

/** The detailed states of a single monitor (the original wording). */
const DETAILED: Record<string, { text: string; color: keyof typeof BADGE_COLORS }> = {
  healthy: { text: "healthy", color: "green" },
  missed: { text: "missed", color: "amber" },
  failed: { text: "failed", color: "red" },
  down: { text: "down", color: "red" },
  paused: { text: "paused", color: "gray" },
  pending: { text: "pending", color: "blue" },
}

/** The three-state wording (plus paused) that a status page also uses. */
const SIMPLE: Record<PublicState, { text: string; color: keyof typeof BADGE_COLORS }> = {
  operational: { text: "up", color: "green" },
  degraded: { text: "late", color: "amber" },
  down: { text: "down", color: "red" },
  paused: { text: "paused", color: "gray" },
}

export interface BadgeData {
  label: string
  message: string
  color: keyof typeof BADGE_COLORS
  /** Extra fields for the JSON format only. */
  extra?: Record<string, unknown>
}

export function monitorBadge(status: string, simple: boolean): BadgeData {
  if (simple) {
    const s = SIMPLE[publicState(status)]
    return { label: "cronko", message: s.text, color: s.color }
  }
  const d = DETAILED[status] ?? { text: status, color: "gray" as const }
  return { label: "cronko", message: d.text, color: d.color }
}

/** Worst state wins, paused monitors are ignored (as on the status page). */
export function tagBadge(tag: string, statuses: readonly string[]): BadgeData {
  const states = statuses.map(publicState)
  const counts = { up: 0, late: 0, down: 0, paused: 0 }
  for (const s of states) counts[SIMPLE[s].text as keyof typeof counts]++
  const s = SIMPLE[overallState(states)]
  return { label: tag, message: s.text, color: s.color, extra: { counts, total: states.length } }
}

/** Escape for XML text and attributes, and drop control characters. */
const xml = (s: string) =>
  [...s]
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join("")
    .replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Rough text width for the 11px sans-serif face used by the badge. */
const textWidth = (s: string) => Math.ceil(s.length * 6.4) + 12

export function renderSvg({ label, message, color }: BadgeData): string {
  const l = textWidth(label)
  const r = textWidth(message)
  const w = l + r
  const text = (x: number, s: string) =>
    `<text x="${x}" y="14" text-anchor="middle" fill="#fff" font-size="11" font-family="Verdana,DejaVu Sans,sans-serif">${xml(s)}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${xml(label)}: ${xml(message)}">
  <title>${xml(label)}: ${xml(message)}</title>
  <rect width="${l}" height="20" fill="${BADGE_COLORS.label}" rx="3"/>
  <rect x="${l}" width="${r}" height="20" fill="${BADGE_COLORS[color]}" rx="3"/>
  <rect x="${l}" width="4" height="20" fill="${BADGE_COLORS[color]}"/>
  ${text(l / 2, label)}
  ${text(l + r / 2, message)}
</svg>`
}

export function renderBadge(data: BadgeData, format: BadgeFormat) {
  if (format === "json") {
    return {
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ label: data.label, status: data.message, ...data.extra }),
    }
  }
  if (format === "shields") {
    return {
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        schemaVersion: 1,
        label: data.label,
        message: data.message,
        color: SHIELDS_COLOR[data.color],
      }),
    }
  }
  return { contentType: "image/svg+xml", body: renderSvg(data) }
}

/** `abc.json` -> json, `abc.shields.json` -> shields, otherwise svg. */
export function splitFormat(param: string): { name: string; format: BadgeFormat } {
  if (param.endsWith(".shields.json")) {
    return { name: param.slice(0, -".shields.json".length), format: "shields" }
  }
  if (param.endsWith(".json")) return { name: param.slice(0, -".json".length), format: "json" }
  return { name: param, format: "svg" }
}

/** WCAG relative luminance contrast of white text on `hex`. */
export function contrastWithWhite(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0)
  return 1.05 / (lum + 0.05)
}
