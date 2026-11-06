import { and, asc, eq } from "drizzle-orm"
import { db } from "../index"
import { monitors } from "../schema"

export async function findAllMonitors() {
  return db
    .select({
      id: monitors.id,
      name: monitors.name,
      slug: monitors.slug,
      token: monitors.token,
      status: monitors.status,
      expectedIntervalSeconds: monitors.expectedIntervalSeconds,
      gracePeriodSeconds: monitors.gracePeriodSeconds,
      paused: monitors.paused,
      maxDurationMs: monitors.maxDurationMs,
      displayOrder: monitors.displayOrder,
      createdAt: monitors.createdAt,
      updatedAt: monitors.updatedAt,
    })
    .from(monitors)
    .orderBy(asc(monitors.displayOrder))
    .all()
}

export async function findMonitorById(id: string) {
  return db.select().from(monitors).where(eq(monitors.id, id)).get()
}

export async function findMonitorByToken(token: string) {
  return db.select().from(monitors).where(eq(monitors.token, token)).get()
}

export async function findMonitorBySlug(slug: string) {
  return db.select().from(monitors).where(eq(monitors.slug, slug)).get()
}

export async function createMonitor(input: {
  id: string
  name: string
  slug: string
  token: string
  expectedIntervalSeconds: number
  gracePeriodSeconds: number
  maxDurationMs?: number
  now: Date
}) {
  await db.insert(monitors).values({
    id: input.id,
    name: input.name,
    slug: input.slug,
    token: input.token,
    expectedIntervalSeconds: input.expectedIntervalSeconds,
    gracePeriodSeconds: input.gracePeriodSeconds,
    maxDurationMs: input.maxDurationMs ?? null,
    status: "pending",
    createdAt: input.now,
    updatedAt: input.now,
  })

  const created = await findMonitorById(input.id)
  if (!created) throw new Error(`monitor ${input.id} missing after insert`)
  return created
}

export async function updateMonitor(
  id: string,
  input: {
    name?: string
    expectedIntervalSeconds?: number
    gracePeriodSeconds?: number
    maxDurationMs?: number
    now: Date
  },
) {
  await db
    .update(monitors)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.expectedIntervalSeconds !== undefined && {
        expectedIntervalSeconds: input.expectedIntervalSeconds,
      }),
      ...(input.gracePeriodSeconds !== undefined && {
        gracePeriodSeconds: input.gracePeriodSeconds,
      }),
      ...(input.maxDurationMs !== undefined && { maxDurationMs: input.maxDurationMs }),
      updatedAt: input.now,
    })
    .where(eq(monitors.id, id))

  return findMonitorById(id)
}

export async function deleteMonitor(id: string) {
  await db.delete(monitors).where(eq(monitors.id, id))
}

export async function pauseMonitor(id: string) {
  await db
    .update(monitors)
    .set({ paused: true, status: "paused", updatedAt: new Date() })
    .where(eq(monitors.id, id))

  return findMonitorById(id)
}

export async function resumeMonitor(id: string) {
  await db
    .update(monitors)
    .set({ paused: false, status: "pending", updatedAt: new Date() })
    .where(eq(monitors.id, id))

  return findMonitorById(id)
}

export async function updateMonitorStatus(
  id: string,
  status: "healthy" | "missed" | "down" | "paused" | "pending",
) {
  await db.update(monitors).set({ status, updatedAt: new Date() }).where(eq(monitors.id, id))

  return findMonitorById(id)
}

type MonitorStatus = "healthy" | "missed" | "down" | "paused" | "pending"

/**
 * Compare-and-set status change. Returns true only for the caller that
 * actually performed the transition, so side effects (incidents, alerts) run
 * exactly once even if the scheduler and a ping (or two replicas) race.
 */
export async function transitionMonitorStatus(
  id: string,
  from: MonitorStatus,
  to: MonitorStatus,
): Promise<boolean> {
  const result = db
    .update(monitors)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(monitors.id, id), eq(monitors.status, from)))
    .run()

  return result.changes === 1
}
