import { describe, expect, it } from "vitest"
import {
  activeMaintenanceUntil,
  appliesTo,
  parseWeeklySchedule,
  weeklySchedule,
  windowBounds,
} from "../maintenance"

const at = (iso: string) => new Date(iso)
// Sunday 02:00-04:00 in São Paulo (UTC-3, no DST since 2019) = 05:00-07:00 UTC.
const sunday = { schedule: "0 2 * * 0", timezone: "America/Sao_Paulo", durationMinutes: 120 }

describe("windowBounds", () => {
  it("is active inside the window, in the window's own timezone", () => {
    // 2026-11-08 is a Sunday.
    const r = windowBounds(sunday, at("2026-11-08T06:00:00Z"))
    expect(r.activeUntil?.toISOString()).toBe("2026-11-08T07:00:00.000Z")
  })

  it("is inactive just before the start and exactly at the end", () => {
    expect(windowBounds(sunday, at("2026-11-08T04:59:00Z")).activeUntil).toBeNull()
    expect(windowBounds(sunday, at("2026-11-08T07:00:00Z")).activeUntil).toBeNull()
  })

  it("is active exactly at the start", () => {
    expect(windowBounds(sunday, at("2026-11-08T05:00:00Z")).activeUntil).not.toBeNull()
  })

  it("reports the next start", () => {
    const r = windowBounds(sunday, at("2026-11-06T12:00:00Z"))
    expect(r.activeUntil).toBeNull()
    expect(r.nextStart?.toISOString()).toBe("2026-11-08T05:00:00.000Z")
  })

  it("handles a window that crosses midnight", () => {
    const nightly = { schedule: "0 23 * * *", timezone: "UTC", durationMinutes: 180 }
    expect(windowBounds(nightly, at("2026-11-07T01:30:00Z")).activeUntil?.toISOString()).toBe(
      "2026-11-07T02:00:00.000Z",
    )
    expect(windowBounds(nightly, at("2026-11-07T02:30:00Z")).activeUntil).toBeNull()
  })

  it("follows DST in the window's timezone", () => {
    // New York: 09:00 local is 14:00 UTC in winter and 13:00 UTC in summer.
    const ny = { schedule: "0 9 * * *", timezone: "America/New_York", durationMinutes: 30 }
    expect(windowBounds(ny, at("2026-01-15T14:10:00Z")).activeUntil).not.toBeNull()
    expect(windowBounds(ny, at("2026-07-15T13:10:00Z")).activeUntil).not.toBeNull()
    expect(windowBounds(ny, at("2026-07-15T14:10:00Z")).activeUntil).toBeNull()
  })

  it("is never active for an invalid schedule", () => {
    const bad = { schedule: "nope", timezone: "UTC", durationMinutes: 60 }
    expect(windowBounds(bad, at("2026-11-08T06:00:00Z"))).toEqual({
      activeUntil: null,
      nextStart: null,
    })
  })
})

describe("appliesTo / activeMaintenanceUntil", () => {
  const monitor = { id: "m1", tags: ["prod", "etl"] }
  const base = { ...sunday, enabled: true }

  it("matches all, a tag the monitor has, or the monitor itself", () => {
    expect(appliesTo({ ...base, target: "all", targetValue: null }, monitor)).toBe(true)
    expect(appliesTo({ ...base, target: "tag", targetValue: "prod" }, monitor)).toBe(true)
    expect(appliesTo({ ...base, target: "tag", targetValue: "staging" }, monitor)).toBe(false)
    expect(appliesTo({ ...base, target: "monitor", targetValue: "m1" }, monitor)).toBe(true)
    expect(appliesTo({ ...base, target: "monitor", targetValue: "m2" }, monitor)).toBe(false)
    expect(appliesTo({ ...base, target: "all", targetValue: null, enabled: false }, monitor)).toBe(
      false,
    )
  })

  it("returns the latest end among the windows covering the monitor", () => {
    const now = at("2026-11-08T06:00:00Z")
    const windows = [
      { ...base, target: "tag" as const, targetValue: "prod" },
      { ...base, durationMinutes: 240, target: "all" as const, targetValue: null },
      { ...base, durationMinutes: 600, target: "tag" as const, targetValue: "staging" },
    ]
    expect(activeMaintenanceUntil(windows, monitor, now)?.toISOString()).toBe(
      "2026-11-08T09:00:00.000Z",
    )
    expect(activeMaintenanceUntil(windows, monitor, at("2026-11-09T06:00:00Z"))).toBeNull()
  })
})

describe("weeklySchedule / parseWeeklySchedule", () => {
  it("round-trips days, hour and minute", () => {
    const s = weeklySchedule([6, 0, 0], 2, 30)
    expect(s).toBe("30 2 * * 0,6")
    expect(parseWeeklySchedule(s)).toEqual({ days: [0, 6], hour: 2, minute: 30 })
  })

  it("uses * for every day and reads it back as all seven", () => {
    expect(weeklySchedule([0, 1, 2, 3, 4, 5, 6], 23, 0)).toBe("0 23 * * *")
    expect(parseWeeklySchedule("0 23 * * *")?.days).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it("refuses cron forms it did not write", () => {
    expect(parseWeeklySchedule("*/5 * * * *")).toBeNull()
    expect(parseWeeklySchedule("0 2 1 * *")).toBeNull()
    expect(parseWeeklySchedule("99 2 * * 0")).toBeNull()
  })
})
