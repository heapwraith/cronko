/**
 * Monitor tags: short labels such as "production", "backup" or "client-x", used to
 * filter lists and, later, to group monitors on a status page.
 */

export const MAX_TAGS = 10
export const MAX_TAG_LENGTH = 32

/** Lowercase letters, digits and - _ . ; must start with a letter or digit. */
export const TAG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/

/** "  Production DB " -> "production-db". Returns "" when nothing usable is left. */
export function normalizeTag(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // drop accents: "produção" -> "producao"
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+/, "")
    .slice(0, MAX_TAG_LENGTH)
}

/** Normalized, unique, valid tags in input order, at most MAX_TAGS. */
export function normalizeTags(raw: readonly string[]): string[] {
  const out: string[] = []
  for (const r of raw) {
    const tag = normalizeTag(r)
    if (tag && TAG_PATTERN.test(tag) && !out.includes(tag)) out.push(tag)
    if (out.length === MAX_TAGS) break
  }
  return out
}

/** Every tag in use, with how many monitors carry it, most used first. */
export function tagCounts(monitors: readonly { tags?: readonly string[] | null }[]) {
  const counts = new Map<string, number>()
  for (const m of monitors) for (const t of m.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
