/**
 * Custom request headers and body template for the generic webhook channel.
 *
 * The template language is deliberately tiny: `{{name}}` placeholders and nothing else, so a
 * template can never run code. Unknown placeholders are rejected when the channel is saved.
 */

export const TEMPLATE_PLACEHOLDERS = [
  "event",
  "status",
  "message",
  "url",
  "sentAt",
  "monitor.name",
] as const

export const MAX_TEMPLATE_LENGTH = 4000
export const MAX_HEADERS = 20

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/
/** Headers the HTTP client owns; letting users set them would break or smuggle requests. */
const FORBIDDEN_HEADERS = new Set(["host", "content-length", "transfer-encoding", "connection"])
const MASK = "****"

export interface TemplateContext {
  event: string
  /** The alert text without its trailing Cronko link. */
  message: string
  url: string
  monitorName: string
  sentAt: string
}

/** Names used in `template` that are not supported placeholders. */
export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(TEMPLATE_PLACEHOLDERS)
  const bad = new Set<string>()
  for (const m of template.matchAll(PLACEHOLDER)) {
    if (!known.has(m[1] ?? "")) bad.add(m[1] ?? "")
  }
  return [...bad]
}

function values(ctx: TemplateContext): Record<string, string> {
  return {
    event: ctx.event,
    status: ctx.event === "recovered" ? "up" : "down",
    message: ctx.message,
    url: ctx.url,
    sentAt: ctx.sentAt,
    "monitor.name": ctx.monitorName,
  }
}

const jsonEscape = (s: string) => JSON.stringify(s).slice(1, -1)

/** Replaces placeholders; unknown ones render empty. `json` escapes values for a JSON string. */
export function renderTemplate(template: string, ctx: TemplateContext, json: boolean): string {
  const vals = values(ctx)
  return template.replace(PLACEHOLDER, (_, name: string) => {
    const v = Object.hasOwn(vals, name) ? (vals[name] ?? "") : ""
    return json ? jsonEscape(v) : v
  })
}

export type ParsedHeaders = { headers: Record<string, string>; error?: string }

/** Parses "Name: value" lines. Blank lines are ignored. */
export function parseHeaders(text: string | undefined): ParsedHeaders {
  const headers: Record<string, string> = {}
  const lines = (text ?? "").split(/\r?\n/).filter((l) => l.trim())
  if (lines.length > MAX_HEADERS) return { headers, error: `At most ${MAX_HEADERS} headers` }
  for (const line of lines) {
    const i = line.indexOf(":")
    const name = i > 0 ? line.slice(0, i).trim() : ""
    const value = i > 0 ? line.slice(i + 1).trim() : ""
    if (!HEADER_NAME.test(name))
      return { headers, error: `Invalid header line: "${line.slice(0, 40)}"` }
    if (FORBIDDEN_HEADERS.has(name.toLowerCase())) {
      return { headers, error: `Header not allowed: ${name}` }
    }
    if (!/^[\x20-\x7e\t]*$/.test(value)) {
      return { headers, error: `Header value must be printable ASCII: ${name}` }
    }
    headers[name] = value
  }
  return { headers }
}

/** True when the effective content type is JSON (default when no Content-Type header is set). */
export function isJsonContentType(headers: Record<string, string>): boolean {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === "content-type")
  return key === undefined || /json/i.test(headers[key] ?? "")
}

const maskValue = (v: string) => (v.length > 8 ? `${MASK}${v.slice(-4)}` : MASK)

/** Hides header values (they usually carry tokens); names stay visible so the form is editable. */
export function maskHeaders(text: string | undefined): string {
  return (text ?? "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const i = line.indexOf(":")
      return i > 0 ? `${line.slice(0, i).trim()}: ${maskValue(line.slice(i + 1).trim())}` : line
    })
    .join("\n")
}

/** Restores the stored value for any header line the client sent back still masked. */
export function unmaskHeaders(incoming: string, stored: string | undefined): string {
  const old = new Map<string, string>()
  for (const line of (stored ?? "").split(/\r?\n/)) {
    const i = line.indexOf(":")
    if (i > 0) old.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim())
  }
  return incoming
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf(":")
      if (i <= 0) return line
      const name = line.slice(0, i).trim()
      const value = line.slice(i + 1).trim()
      const prev = old.get(name.toLowerCase())
      return prev !== undefined && value === maskValue(prev) ? `${name}: ${prev}` : line
    })
    .join("\n")
}
