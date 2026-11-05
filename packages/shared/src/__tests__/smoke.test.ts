import { describe, expect, it } from "vitest"
import {
  DEFAULT_GRACE_PERIOD_SECONDS,
  MONITOR_STATUS,
  PING_RATE_LIMIT_PER_MINUTE,
} from "../constants"
import type { Heartbeat, Incident, Monitor, NotificationChannel } from "../types"

describe("Shared smoke tests", () => {
  it("exports constants with expected values", () => {
    expect(MONITOR_STATUS.HEALTHY).toBe("healthy")
    expect(MONITOR_STATUS.DOWN).toBe("down")
    expect(MONITOR_STATUS.PAUSED).toBe("paused")
    expect(DEFAULT_GRACE_PERIOD_SECONDS).toBe(120)
    expect(PING_RATE_LIMIT_PER_MINUTE).toBe(60)
  })

  it("exports types (compile-time check)", () => {
    // Type-level verification — these should compile without errors
    const m: Monitor = {} as Monitor
    const _h: Heartbeat = {} as Heartbeat
    const _i: Incident = {} as Incident
    const _nc: NotificationChannel = {} as NotificationChannel
    expect(m).toBeDefined()
  })
})
