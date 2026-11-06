import type * as HeartbeatQueries from "@cronko/database/queries/heartbeats"
import type * as IncidentQueries from "@cronko/database/queries/incidents"
import type * as MonitorQueries from "@cronko/database/queries/monitors"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type * as HeartbeatService from "../../services/heartbeat"
import type * as StateModule from "../../services/monitor-state"
import type * as SchedulerModule from "../../services/scheduler"
import { setupTestDb } from "../helpers/testDb"

const sent: Array<{ name: string; event: string; detail?: string }> = []
vi.mock("../../services/notifier", () => ({
  sendNotification: async (monitor: { name: string }, event: string, detail?: string) => {
    sent.push({ name: monitor.name, event, ...(detail !== undefined && { detail }) })
  },
  // The outbox worker has its own tests (notifier.test.ts); stub it here.
  processDueDeliveries: async () => 0,
  cleanupDeliveries: async () => {},
}))

const MIN = 60_000
const T0 = new Date("2026-11-05T12:00:00Z").getTime()

function snap(overrides: Partial<StateModule.MonitorSnapshot> = {}): StateModule.MonitorSnapshot {
  return {
    id: "m1",
    name: "backup",
    status: "healthy",
    expectedIntervalSeconds: 600, // 10 min
    gracePeriodSeconds: 120, // 2 min
    createdAt: new Date(T0),
    ...overrides,
  }
}

describe("evaluateMonitor (pure)", () => {
  let evaluateMonitor: typeof StateModule.evaluateMonitor

  beforeAll(async () => {
    await setupTestDb()
    ;({ evaluateMonitor } = await import("../../services/monitor-state"))
  })

  const ping = new Date(T0)
  // missedAt = T0 + 12min, downAt = T0 + 22min
  it.each([
    ["on time", "healthy", 5 * MIN, null],
    ["exactly at the deadline", "healthy", 12 * MIN, null],
    ["just past the deadline", "healthy", 12 * MIN + 1, "missed"],
    ["past deadline but already missed", "missed", 15 * MIN, null],
    ["long overdue while healthy goes straight to down", "healthy", 30 * MIN, "down"],
    ["overdue while missed", "missed", 22 * MIN + 1, "down"],
    ["already down stays down", "down", 99 * MIN, null],
    ["paused is never evaluated", "paused", 99 * MIN, null],
    ["pending past missed window is not 'missed'", "pending", 15 * MIN, null],
    ["pending long overdue goes down", "pending", 30 * MIN, "down"],
  ] as const)("%s", (_label, status, elapsed, expected) => {
    expect(evaluateMonitor(snap({ status }), ping, T0 + elapsed)).toBe(expected)
  })

  it("uses createdAt when the monitor never pinged", () => {
    expect(evaluateMonitor(snap({ status: "pending" }), undefined, T0 + 30 * MIN)).toBe("down")
    expect(evaluateMonitor(snap({ status: "pending" }), undefined, T0 + 5 * MIN)).toBeNull()
  })
})

describe("monitor lifecycle (real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let q: {
    createMonitor: typeof MonitorQueries.createMonitor
    findMonitorById: typeof MonitorQueries.findMonitorById
    createHeartbeat: typeof HeartbeatQueries.createHeartbeat
    findOpenIncident: typeof IncidentQueries.findOpenIncident
    findIncidents: typeof IncidentQueries.findIncidents
  }
  let runTick: typeof SchedulerModule.runTick
  let state: typeof StateModule
  let processHeartbeat: typeof HeartbeatService.processHeartbeat

  beforeAll(async () => {
    ctx = await setupTestDb()
    const monitors = await import("@cronko/database/queries/monitors")
    const heartbeats = await import("@cronko/database/queries/heartbeats")
    const incidents = await import("@cronko/database/queries/incidents")
    q = { ...monitors, ...heartbeats, ...incidents }
    ;({ runTick } = await import("../../services/scheduler"))
    state = await import("../../services/monitor-state")
    ;({ processHeartbeat } = await import("../../services/heartbeat"))
  })

  beforeEach(() => {
    ctx.reset()
    sent.length = 0
  })

  async function newMonitor(status: "healthy" | "pending" = "healthy", maxDurationMs?: number) {
    const m = await q.createMonitor({
      id: crypto.randomUUID(),
      name: "backup",
      slug: `backup-${Math.random().toString(36).slice(2)}`,
      token: crypto.randomUUID(),
      expectedIntervalSeconds: 600,
      gracePeriodSeconds: 120,
      ...(maxDurationMs !== undefined && { maxDurationMs }),
      now: new Date(T0),
    })
    if (status === "healthy") {
      const { transitionMonitorStatus } = await import("@cronko/database/queries/monitors")
      await transitionMonitorStatus(m.id, "pending", "healthy")
    }
    await q.createHeartbeat({ id: crypto.randomUUID(), monitorId: m.id, receivedAt: new Date(T0) })
    return m
  }

  const events = () => sent.map((s) => s.event)

  it("healthy -> missed -> down -> recovered, one alert per transition", async () => {
    const m = await newMonitor()

    await runTick(T0 + 5 * MIN)
    expect(events()).toEqual([])

    await runTick(T0 + 13 * MIN)
    expect((await q.findMonitorById(m.id))?.status).toBe("missed")
    expect(events()).toEqual(["missed"])

    // Re-ticking without a state change must not re-alert.
    await runTick(T0 + 14 * MIN)
    await runTick(T0 + 15 * MIN)
    expect(events()).toEqual(["missed"])

    await runTick(T0 + 23 * MIN)
    expect((await q.findMonitorById(m.id))?.status).toBe("down")
    expect(events()).toEqual(["missed", "down"])
    expect(await q.findIncidents({ limit: 10, offset: 0 })).toHaveLength(1)

    const result = await processHeartbeat(m.token, {})
    expect(result.ok).toBe(true)
    expect((await q.findMonitorById(m.id))?.status).toBe("healthy")
    expect(events()).toEqual(["missed", "down", "recovered"])
    expect(await q.findOpenIncident(m.id)).toBeUndefined()
  })

  it("a long outage alerts once with 'down', not missed+down back to back", async () => {
    await newMonitor()
    await runTick(T0 + 60 * MIN)
    expect(events()).toEqual(["down"])
  })

  it("concurrent transitions (two replicas) alert exactly once", async () => {
    const m = await newMonitor()
    const observed = snap({ id: m.id, name: m.name })

    const results = await Promise.all([
      state.markOverdue(observed, "missed", new Date(T0 + 13 * MIN)),
      state.markOverdue(observed, "missed", new Date(T0 + 13 * MIN)),
      state.markOverdue(observed, "missed", new Date(T0 + 13 * MIN)),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(events()).toEqual(["missed"])
    expect(await q.findIncidents({ limit: 10, offset: 0 })).toHaveLength(1)
  })

  it("ping racing the scheduler cannot leave a stale 'down' behind", async () => {
    const m = await newMonitor()
    const token = m.token
    await runTick(T0 + 13 * MIN) // -> missed
    // What the scheduler observed before the ping arrived.
    const stale = snap({ id: m.id, name: m.name, status: "missed" })

    await processHeartbeat(token, {})
    sent.length = 0
    const won = await state.markOverdue(stale, "down", new Date(T0 + 30 * MIN))

    expect(won).toBe(false)
    expect((await q.findMonitorById(m.id))?.status).toBe("healthy")
    expect(events()).toEqual([])
  })

  it("first ping on a pending monitor is not announced as a recovery", async () => {
    const m = await newMonitor("pending")
    await processHeartbeat(m.token, {})
    expect((await q.findMonitorById(m.id))?.status).toBe("healthy")
    expect(events()).toEqual([])
  })

  it("never-pinged monitor goes down after the full window", async () => {
    const m = await q.createMonitor({
      id: crypto.randomUUID(),
      name: "never",
      slug: "never",
      token: crypto.randomUUID(),
      expectedIntervalSeconds: 600,
      gracePeriodSeconds: 120,
      now: new Date(T0),
    })
    await runTick(T0 + 15 * MIN)
    expect((await q.findMonitorById(m.id))?.status).toBe("pending")
    await runTick(T0 + 23 * MIN)
    expect((await q.findMonitorById(m.id))?.status).toBe("down")
    expect(events()).toEqual(["down"])
  })

  it("a run over maxDurationMs flags the monitor once and opens one incident", async () => {
    const m = await newMonitor("healthy", 1000)
    await processHeartbeat(m.token, { durationMs: 5000 })
    await processHeartbeat(m.token, { durationMs: 6000 })

    expect((await q.findMonitorById(m.id))?.status).toBe("missed")
    expect(events()).toEqual(["slow"])
    expect(await q.findIncidents({ limit: 10, offset: 0 })).toHaveLength(1)

    // A fast run afterwards clears it.
    await processHeartbeat(m.token, { durationMs: 200 })
    expect((await q.findMonitorById(m.id))?.status).toBe("healthy")
    expect(events()).toEqual(["slow", "recovered"])
  })

  describe("failure signal", () => {
    it("explicit /fail alerts immediately with the exit code, once", async () => {
      const m = await newMonitor()
      await processHeartbeat(m.token, { failed: true, exitCode: 2 })
      await processHeartbeat(m.token, { failed: true, exitCode: 2 })

      expect((await q.findMonitorById(m.id))?.status).toBe("failed")
      expect(sent).toEqual([{ name: "backup", event: "failed", detail: "exit code 2" }])
      expect(await q.findIncidents({ limit: 10, offset: 0 })).toHaveLength(1)
    })

    it("a non-zero exit code on a normal ping is a failure", async () => {
      const m = await newMonitor()
      await processHeartbeat(m.token, { exitCode: 1 })
      expect((await q.findMonitorById(m.id))?.status).toBe("failed")
      expect(events()).toEqual(["failed"])
    })

    it("exit code 0 is a success and does not alert", async () => {
      const m = await newMonitor()
      await processHeartbeat(m.token, { exitCode: 0 })
      expect((await q.findMonitorById(m.id))?.status).toBe("healthy")
      expect(events()).toEqual([])
    })

    it("a good ping recovers a failed monitor and closes the incident", async () => {
      const m = await newMonitor()
      await processHeartbeat(m.token, { failed: true })
      await processHeartbeat(m.token, { exitCode: 0 })

      expect((await q.findMonitorById(m.id))?.status).toBe("healthy")
      expect(events()).toEqual(["failed", "recovered"])
      expect(await q.findOpenIncident(m.id)).toBeUndefined()
    })

    it("the scheduler does not escalate an already-reported failure to down", async () => {
      const m = await newMonitor()
      await processHeartbeat(m.token, { failed: true })
      sent.length = 0

      await runTick(Date.now() + 365 * 24 * 60 * MIN)
      expect((await q.findMonitorById(m.id))?.status).toBe("failed")
      expect(events()).toEqual([])
    })

    it("a failure on a pending monitor is reported", async () => {
      const m = await newMonitor("pending")
      await processHeartbeat(m.token, { failed: true })
      expect((await q.findMonitorById(m.id))?.status).toBe("failed")
    })

    it("a start pulse neither recovers nor fails the monitor", async () => {
      const m = await newMonitor()
      await processHeartbeat(m.token, { failed: true })
      sent.length = 0

      await processHeartbeat(m.token, { pulseType: "start" })
      expect((await q.findMonitorById(m.id))?.status).toBe("failed")
      expect(events()).toEqual([])
    })

    it("failure beats slow when both apply", async () => {
      const m = await newMonitor("healthy", 1000)
      await processHeartbeat(m.token, { exitCode: 1, durationMs: 5000 })
      expect(events()).toEqual(["failed"])
    })
  })

  it("paused monitors are ignored", async () => {
    const m = await newMonitor()
    const { pauseMonitor } = await import("@cronko/database/queries/monitors")
    await pauseMonitor(m.id)
    await runTick(T0 + 99 * MIN)
    expect(events()).toEqual([])
  })

  it("unknown token -> 404", async () => {
    const result = await processHeartbeat("nope", {})
    expect(result).toMatchObject({ ok: false, status: 404 })
  })
})

describe("cron schedules (pure)", () => {
  let mod: typeof StateModule

  beforeAll(async () => {
    await setupTestDb()
    mod = await import("../../services/monitor-state")
  })

  const D = (iso: string) => new Date(iso)
  const cron = (over: Partial<StateModule.MonitorSnapshot> = {}): StateModule.MonitorSnapshot => ({
    id: "c1",
    name: "nightly",
    status: "healthy",
    expectedIntervalSeconds: 86_400,
    gracePeriodSeconds: 120,
    createdAt: D("2026-11-05T12:00:00Z"),
    scheduleCron: "0 2 * * *",
    timezone: "UTC",
    ...over,
  })

  it("derives the deadline from the next scheduled run, not the last ping", () => {
    const w = mod.expectedWindow(cron(), D("2026-11-05T02:00:30Z"))
    expect(w.nextExpected.toISOString()).toBe("2026-11-06T02:00:00.000Z")
    expect(new Date(w.missedAt).toISOString()).toBe("2026-11-06T02:02:00.000Z")
    expect(new Date(w.downAt).toISOString()).toBe("2026-11-07T02:02:00.000Z")
  })

  it.each([
    ["before the run", "2026-11-06T01:00:00Z", "healthy", null],
    ["inside the grace window", "2026-11-06T02:01:30Z", "healthy", null],
    ["just past grace", "2026-11-06T02:02:01Z", "healthy", "missed"],
    ["a full period late", "2026-11-07T02:03:00Z", "missed", "down"],
  ] as const)("evaluates %s", (_label, at, status, expected) => {
    const last = D("2026-11-05T02:00:30Z")
    expect(mod.evaluateMonitor(cron({ status }), last, D(at).getTime())).toBe(expected)
  })

  it("treats a ping a few seconds before the slot as that slot's ping", () => {
    const early = D("2026-11-06T01:59:50Z") // 10 s before the 02:00 slot
    const w = mod.expectedWindow(cron(), early)
    expect(w.nextExpected.toISOString()).toBe("2026-11-07T02:00:00.000Z")
    expect(mod.evaluateMonitor(cron(), early, D("2026-11-06T02:10:00Z").getTime())).toBeNull()
  })

  it("does not swallow a genuinely early run for a frequent schedule", () => {
    // */5: a ping at 12:01 is 4 min before the 12:05 slot, more than half the period.
    const m = cron({ scheduleCron: "*/5 * * * *", expectedIntervalSeconds: 300 })
    const w = mod.expectedWindow(m, D("2026-11-05T12:01:00Z"))
    expect(w.nextExpected.toISOString()).toBe("2026-11-05T12:05:00.000Z")
  })

  it("counts from creation for a cron monitor that never pinged", () => {
    const w = mod.expectedWindow(cron(), undefined)
    expect(w.nextExpected.toISOString()).toBe("2026-11-06T02:00:00.000Z")
  })

  it("respects the timezone", () => {
    // 02:00 in Sao Paulo (UTC-3, no DST since 2019) is 05:00 UTC.
    const w = mod.expectedWindow(cron({ timezone: "America/Sao_Paulo" }), D("2026-11-05T12:00:00Z"))
    expect(w.nextExpected.toISOString()).toBe("2026-11-06T05:00:00.000Z")
  })

  it("falls back to the interval when the stored cron is invalid", () => {
    const w = mod.expectedWindow(cron({ scheduleCron: "not a cron" }), D("2026-11-05T12:00:00Z"))
    expect(w.nextExpected.toISOString()).toBe("2026-11-06T12:00:00.000Z")
  })
})
