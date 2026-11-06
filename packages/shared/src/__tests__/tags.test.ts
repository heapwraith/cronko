import { describe, expect, it } from "vitest"
import { MAX_TAGS, normalizeTag, normalizeTags, TAG_PATTERN, tagCounts } from "../tags"

describe("normalizeTag", () => {
  it("lowercases, trims, hyphenates spaces and drops accents", () => {
    expect(normalizeTag("  Production DB ")).toBe("production-db")
    expect(normalizeTag("Produção")).toBe("producao")
    expect(normalizeTag("cliente_x.v2")).toBe("cliente_x.v2")
  })

  it("removes characters outside the allowed set and leading punctuation", () => {
    expect(normalizeTag("#backup!")).toBe("backup")
    expect(normalizeTag("--etl")).toBe("etl")
    expect(normalizeTag("🔥")).toBe("")
  })

  it("caps the length", () => {
    expect(normalizeTag("a".repeat(50))).toHaveLength(32)
  })
})

describe("normalizeTags", () => {
  it("dedupes after normalizing and keeps input order", () => {
    expect(normalizeTags(["Backup", "etl", "backup ", "ETL"])).toEqual(["backup", "etl"])
  })

  it("drops empty and invalid entries", () => {
    expect(normalizeTags(["", "  ", "🔥", "ok"])).toEqual(["ok"])
  })

  it("keeps at most MAX_TAGS", () => {
    const many = Array.from({ length: 15 }, (_, i) => `t${i}`)
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS)
  })

  it("only ever returns tags that match TAG_PATTERN", () => {
    for (const t of normalizeTags(["A B", "x/y", "._z", "ünïcödé", "ok-1"])) {
      expect(TAG_PATTERN.test(t)).toBe(true)
    }
  })
})

describe("tagCounts", () => {
  it("counts tags across monitors, most used first, then alphabetically", () => {
    expect(
      tagCounts([{ tags: ["prod", "etl"] }, { tags: ["prod"] }, { tags: [] }, { tags: null }, {}]),
    ).toEqual([
      { tag: "prod", count: 2 },
      { tag: "etl", count: 1 },
    ])
  })
})
