import { describe, expect, it } from "vitest"
import {
  isSupportedPattern,
  isValidSchedule,
  isValidTimezone,
  nextRun,
  nextRuns,
  schedulePeriodSeconds,
} from "../schedule"

const iso = (d: Date | null) => d?.toISOString()

describe("schedule", () => {
  it("finds the next run after a date, in UTC by default", () => {
    expect(iso(nextRun("*/5 * * * *", undefined, new Date("2026-11-05T12:01:00Z")))).toBe(
      "2026-11-05T12:05:00.000Z",
    )
    expect(iso(nextRun("0 2 * * *", null, new Date("2026-11-05T12:00:00Z")))).toBe(
      "2026-11-06T02:00:00.000Z",
    )
  })

  it("is strictly after the given instant (a run exactly at `after` is skipped)", () => {
    expect(iso(nextRun("0 2 * * *", "UTC", new Date("2026-11-05T02:00:00Z")))).toBe(
      "2026-11-06T02:00:00.000Z",
    )
  })

  it("honours the timezone, including the daylight-saving switch", () => {
    // Europe/Berlin: 02:00 is UTC+1 before 2026-03-29 and UTC+2 after it.
    const runs = nextRuns("0 2 * * *", "Europe/Berlin", new Date("2026-03-28T12:00:00Z"), 3)
    expect(runs.map(iso)).toEqual([
      "2026-03-29T01:00:00.000Z",
      "2026-03-30T00:00:00.000Z",
      "2026-03-31T00:00:00.000Z",
    ])
  })

  it("accepts nicknames and rejects seconds fields and garbage", () => {
    expect(isSupportedPattern("@daily")).toBe(true)
    expect(isSupportedPattern("0 2 * * *")).toBe(true)
    expect(isSupportedPattern("*/10 * * * * *")).toBe(false)
    expect(isValidSchedule("nope * * * *")).toBe(false)
    expect(isValidSchedule("")).toBe(false)
    expect(isValidSchedule("0 2 * * *", "Mars/Base")).toBe(false)
    expect(isValidTimezone("America/Sao_Paulo")).toBe(true)
  })

  it("returns null/empty for invalid input instead of throwing", () => {
    expect(nextRun("bad", "UTC", new Date())).toBeNull()
    expect(nextRuns("bad", "UTC", new Date(), 3)).toEqual([])
    expect(schedulePeriodSeconds("bad", "UTC", new Date())).toBeNull()
  })

  it("derives the period between consecutive runs", () => {
    const at = new Date("2026-11-05T12:00:00Z")
    expect(schedulePeriodSeconds("*/15 * * * *", "UTC", at)).toBe(900)
    expect(schedulePeriodSeconds("0 2 * * *", "UTC", at)).toBe(86_400)
    expect(schedulePeriodSeconds("0 8 * * 1", "UTC", at)).toBe(604_800)
  })
})
