import { describe, expect, it } from "vitest"
import {
  dailyUptime,
  overallState,
  overallUptime,
  publicState,
  STATUS_SLUG_PATTERN,
} from "../status"

const at = (iso: string) => new Date(iso)

describe("publicState / overallState", () => {
  it("maps internal states to the four public ones", () => {
    expect(publicState("healthy")).toBe("operational")
    expect(publicState("pending")).toBe("operational")
    expect(publicState("missed")).toBe("degraded")
    expect(publicState("down")).toBe("down")
    expect(publicState("failed")).toBe("down")
    expect(publicState("paused")).toBe("paused")
  })

  it("reports the worst active state and ignores paused monitors", () => {
    expect(overallState(["operational", "degraded"])).toBe("degraded")
    expect(overallState(["operational", "down", "degraded"])).toBe("down")
    expect(overallState(["operational", "paused"])).toBe("operational")
    expect(overallState(["paused", "paused"])).toBe("paused")
    expect(overallState([])).toBe("operational")
  })
})

describe("dailyUptime", () => {
  const now = at("2026-11-06T12:00:00Z")
  const createdLongAgo = at("2026-01-01T00:00:00Z")

  it("returns one entry per UTC day, oldest first, ending today", () => {
    const days = dailyUptime({ incidents: [], createdAt: createdLongAgo, now, days: 3 })
    expect(days.map((d) => d.date)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06"])
    expect(days.every((d) => d.uptime === 1)).toBe(true)
  })

  it("counts a 6-hour incident as 75% of that day", () => {
    const days = dailyUptime({
      incidents: [
        { startedAt: at("2026-11-05T06:00:00Z"), resolvedAt: at("2026-11-05T12:00:00Z") },
      ],
      createdAt: createdLongAgo,
      now,
      days: 2,
    })
    expect(days[0]).toEqual({ date: "2026-11-05", uptime: 0.75 })
    expect(days[1]?.uptime).toBe(1)
  })

  it("splits an incident across midnight and treats an open one as running until now", () => {
    const days = dailyUptime({
      incidents: [{ startedAt: at("2026-11-05T18:00:00Z"), resolvedAt: null }],
      createdAt: createdLongAgo,
      now,
      days: 2,
    })
    expect(days[0]?.uptime).toBe(0.75) // 18:00 to midnight
    expect(days[1]?.uptime).toBe(0) // midnight to now, still open
  })

  it("does not count overlapping incidents twice", () => {
    const days = dailyUptime({
      incidents: [
        { startedAt: at("2026-11-05T00:00:00Z"), resolvedAt: at("2026-11-05T12:00:00Z") },
        { startedAt: at("2026-11-05T06:00:00Z"), resolvedAt: at("2026-11-05T12:00:00Z") },
      ],
      createdAt: createdLongAgo,
      now,
      days: 2,
    })
    expect(days[0]?.uptime).toBe(0.5)
  })

  it("has no data before the monitor existed and measures from its creation", () => {
    const days = dailyUptime({
      incidents: [
        { startedAt: at("2026-11-05T18:00:00Z"), resolvedAt: at("2026-11-06T00:00:00Z") },
      ],
      createdAt: at("2026-11-05T12:00:00Z"),
      now,
      days: 3,
    })
    expect(days[0]).toEqual({ date: "2026-11-04", uptime: null })
    expect(days[1]?.uptime).toBe(0.5) // watched 12:00-24:00, down 18:00-24:00
    expect(days[2]?.uptime).toBe(1)
  })
})

describe("overallUptime", () => {
  it("averages the days with data and ignores days without", () => {
    expect(
      overallUptime([
        { date: "a", uptime: null },
        { date: "b", uptime: 1 },
        { date: "c", uptime: 0.5 },
      ]),
    ).toBe(0.75)
    expect(overallUptime([{ date: "a", uptime: null }])).toBeNull()
  })
})

describe("STATUS_SLUG_PATTERN", () => {
  it("accepts simple slugs and rejects risky ones", () => {
    for (const ok of ["prod", "client-x", "a", "status-2026"]) {
      expect(STATUS_SLUG_PATTERN.test(ok)).toBe(true)
    }
    for (const bad of ["", "-x", "x-", "Prod", "a/b", "a b", "..", "a".repeat(49)]) {
      expect(STATUS_SLUG_PATTERN.test(bad)).toBe(false)
    }
  })
})
