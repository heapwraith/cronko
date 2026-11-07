import { describe, expect, it } from "vitest"
import { parseCronitorSchedule } from "../../services/importers"

describe("parseCronitorSchedule", () => {
  it.each([
    ["0 0 * * *", { scheduleCron: "0 0 * * *" }],
    ["*/5 * * * *", { scheduleCron: "*/5 * * * *" }],
    ["every 5 minutes", { expectedIntervalSeconds: 300 }],
    ["every 1 min", { expectedIntervalSeconds: 60 }],
    ["every 30s", { expectedIntervalSeconds: 30 }],
    ["Every 2 Hours", { expectedIntervalSeconds: 7200 }],
    ["every 24 hours", { expectedIntervalSeconds: 86_400 }],
    ["every 1 day", { expectedIntervalSeconds: 86_400 }],
    ["at 14:30", { scheduleCron: "30 14 * * *" }],
    ["at 9:05", { scheduleCron: "5 9 * * *" }],
    ["  every 10 min  ", { expectedIntervalSeconds: 600 }],
  ])("reads %j", (expr, expected) => {
    expect(parseCronitorSchedule(expr)).toEqual(expected)
  })

  it.each([
    "",
    "every",
    "every minutes",
    "every 5 fortnights",
    "at 25:00",
    "at 10:75",
    "sometimes",
    "* * *",
  ])("rejects %j", (expr) => {
    expect(parseCronitorSchedule(expr)).toBeNull()
  })
})
