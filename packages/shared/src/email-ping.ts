/**
 * Ping by e-mail: a job that can only send mail writes to <token>@<domain>.
 *
 * `<token>+fail@<domain>` always reports a failure. Otherwise the message is a
 * success, unless its subject contains one of the monitor's failure keywords
 * ("error", "failed"...), matched case-insensitively.
 */

export const MAX_EMAIL_KEYWORDS = 10
export const MAX_EMAIL_KEYWORD_LENGTH = 40

export type EmailPingKind = "success" | "fail"

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The monitor token and signal in a recipient address, or null when the address is
 * not one of ours (wrong domain, not a token, unknown suffix).
 */
export function parseRecipient(
  address: string,
  domain: string | null | undefined,
): { token: string; kind: EmailPingKind } | null {
  const at = address.lastIndexOf("@")
  if (at <= 0) return null
  const local = address.slice(0, at).toLowerCase()
  const host = address.slice(at + 1).toLowerCase()
  if (domain && host !== domain.toLowerCase()) return null

  const [token = "", suffix, ...rest] = local.split("+")
  if (rest.length > 0 || !TOKEN.test(token)) return null
  if (suffix === undefined) return { token, kind: "success" }
  if (suffix === "fail") return { token, kind: "fail" }
  return null
}

/** Trimmed, lowercased, unique, non-empty, capped. */
export function normalizeEmailKeywords(keywords: readonly string[]): string[] {
  const out: string[] = []
  for (const k of keywords) {
    const v = k.trim().toLowerCase().slice(0, MAX_EMAIL_KEYWORD_LENGTH)
    if (v && !out.includes(v)) out.push(v)
    if (out.length === MAX_EMAIL_KEYWORDS) break
  }
  return out
}

/** What a message to this monitor means. */
export function classifyEmail(
  kind: EmailPingKind,
  subject: string,
  failureKeywords: readonly string[],
): EmailPingKind {
  if (kind === "fail") return "fail"
  const s = subject.toLowerCase()
  return failureKeywords.some((k) => k && s.includes(k.toLowerCase())) ? "fail" : "success"
}

/** The run output stored for an e-mail ping: headers worth seeing, then the text. */
export function emailRunBody(
  input: { from?: string | undefined; subject?: string | undefined; text?: string | undefined },
  maxLength: number,
): string {
  const head = [
    input.from ? `From: ${input.from}` : null,
    `Subject: ${input.subject ?? ""}`,
  ].filter(Boolean)
  const text = (input.text ?? "").replace(/\r\n/g, "\n").trim()
  const full = `${head.join("\n")}\n\n${text}`.trim()
  return full.length > maxLength ? `${full.slice(0, maxLength - 1)}…` : full
}
