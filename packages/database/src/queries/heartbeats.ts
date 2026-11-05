import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm"
import { db } from "../index"
import { heartbeats } from "../schema"

export async function findHeartbeatsByMonitor(
  monitorId: string,
  options: { limit: number; before?: string },
) {
  const where = options.before
    ? and(eq(heartbeats.monitorId, monitorId), lt(heartbeats.receivedAt, new Date(options.before)))
    : eq(heartbeats.monitorId, monitorId)

  return db
    .select()
    .from(heartbeats)
    .where(where)
    .orderBy(desc(heartbeats.receivedAt))
    .limit(Math.min(options.limit, 500))
    .all()
}

export async function findLatestHeartbeat(monitorId: string) {
  return db
    .select()
    .from(heartbeats)
    .where(eq(heartbeats.monitorId, monitorId))
    .orderBy(desc(heartbeats.receivedAt))
    .limit(1)
    .get()
}

export async function findHeartbeatsSince(since: Date) {
  return db.select().from(heartbeats).where(gte(heartbeats.receivedAt, since)).all()
}

export async function createHeartbeat(input: {
  id: string
  monitorId: string
  sourceIp?: string
  userAgent?: string
  durationMs?: number
  exitCode?: number
  body?: string
  receivedAt?: Date
}) {
  await db.insert(heartbeats).values({
    id: input.id,
    monitorId: input.monitorId,
    receivedAt: input.receivedAt ?? new Date(),
    sourceIp: input.sourceIp ?? null,
    userAgent: input.userAgent ?? null,
    durationMs: input.durationMs ?? null,
    exitCode: input.exitCode ?? null,
    body: input.body ?? null,
  })
}

export async function updateHeartbeatDuration(id: string, durationMs: number) {
  await db.update(heartbeats).set({ durationMs }).where(eq(heartbeats.id, id))
}

export async function deleteHeartbeatsOlderThan(cutoff: Date) {
  await db.delete(heartbeats).where(lte(heartbeats.receivedAt, cutoff))
}

export async function findLatestHeartbeats(
  monitorIds: string[],
): Promise<Map<string, { receivedAt: Date; durationMs: number | null }>> {
  if (monitorIds.length === 0) return new Map()

  const rows = await db
    .select({
      monitorId: heartbeats.monitorId,
      receivedAt: heartbeats.receivedAt,
      durationMs: heartbeats.durationMs,
      rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${heartbeats.monitorId} ORDER BY ${heartbeats.receivedAt} DESC)`.as(
        "rn",
      ),
    })
    .from(heartbeats)
    .where(inArray(heartbeats.monitorId, monitorIds))
    .all()

  const map = new Map<string, { receivedAt: Date; durationMs: number | null }>()
  for (const row of rows) {
    if ((row as { rn: number }).rn === 1) {
      map.set(row.monitorId, { receivedAt: row.receivedAt, durationMs: row.durationMs })
    }
  }

  return map
}

/** Most recent heartbeat time per monitor, in a single query. */
export async function findLatestHeartbeatTimes(): Promise<Map<string, Date>> {
  const rows = db
    .select({
      monitorId: heartbeats.monitorId,
      last: sql<number>`max(${heartbeats.receivedAt})`,
    })
    .from(heartbeats)
    .groupBy(heartbeats.monitorId)
    .all()

  // receivedAt is stored as unix seconds (drizzle "timestamp" mode).
  return new Map(rows.map((r) => [r.monitorId, new Date(r.last * 1000)]))
}
