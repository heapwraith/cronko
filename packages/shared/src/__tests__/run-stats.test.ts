import { describe, expect, it } from "vitest"
import { durationStats, isRunSample, isUnusuallySlow, percentile, slowFactor } from "../run-stats"

describe("percentile (nearest rank)", () => {
  it("picks real samples and handles edges", () => {
    const s = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(percentile(s, 0.5)).toBe(50)
    expect(percentile(s, 0.95)).toBe(100)
    expect(percentile(s, 0)).toBe(10)
    expect(percentile([7], 0.95)).toBe(7)
    expect(percentile([], 0.5)).toBe(0)
  })
})

describe("durationStats", () => {
  it("returns null without samples and ignores invalid values", () => {
    expect(durationStats([])).toBeNull()
    expect(durationStats([Number.NaN, -1])).toBeNull()
    expect(durationStats([3000, -5, 1000, 2000])).toEqual({
      count: 3,
      p50: 2000,
      p95: 3000,
      max: 3000,
    })
  })

  it("does not mutate the input", () => {
    const input = [3, 1, 2]
    durationStats(input)
    expect(input).toEqual([3, 1, 2])
  })
})

describe("isRunSample", () => {
  it("counts runs once: start rows are the other half of a finish row", () => {
    expect(isRunSample({ durationMs: 1000, kind: null })).toBe(true)
    expect(isRunSample({ durationMs: 1000, kind: "finish" })).toBe(true)
    expect(isRunSample({ durationMs: 1000, kind: "start" })).toBe(false)
    expect(isRunSample({ durationMs: null, kind: null })).toBe(false)
  })
})

describe("isUnusuallySlow", () => {
  // Ten runs around 40 s: p50 40 s, p95 44 s.
  const baseline = durationStats([36, 38, 39, 40, 40, 40, 41, 42, 43, 44].map((s) => s * 1000))

  it("flags a run far above the usual range", () => {
    expect(isUnusuallySlow(120_000, baseline)).toBe(true)
  })

  it("does not flag normal variation", () => {
    expect(isUnusuallySlow(44_000, baseline)).toBe(false)
    expect(isUnusuallySlow(66_000, baseline)).toBe(false) // 1.5 × p95, not above it
    expect(isUnusuallySlow(70_000, baseline)).toBe(false) // above 1.5 × p95 but under 2 × median
  })

  it("needs enough history", () => {
    const short = durationStats([1000, 1000, 1000, 1000])
    expect(isUnusuallySlow(60_000, short)).toBe(false)
    expect(isUnusuallySlow(60_000, null)).toBe(false)
    expect(isUnusuallySlow(null, baseline)).toBe(false)
  })

  it("ignores tiny absolute differences on very short jobs", () => {
    const fast = durationStats([200, 210, 220, 200, 190, 205])
    expect(isUnusuallySlow(3_000, fast)).toBe(false) // 14× but under 5 s more
    expect(isUnusuallySlow(8_000, fast)).toBe(true)
  })
})

describe("slowFactor", () => {
  it("is the ratio to the median, one decimal", () => {
    expect(slowFactor(120_000, durationStats([40_000, 40_000, 40_000]))).toBe(3)
    expect(slowFactor(50_000, durationStats([30_000]))).toBe(1.7)
    expect(slowFactor(1000, null)).toBeNull()
    expect(slowFactor(1000, durationStats([0]))).toBeNull()
  })
})
