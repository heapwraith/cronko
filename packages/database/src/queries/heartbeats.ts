import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm"
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
  kind?: "start" | "finish"
  overlapped?: boolean
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
    kind: input.kind ?? null,
    overlapped: input.overlapped ?? false,
  })
}

/**
 * Durations of the most recent runs, newest first, for analytics. Start rows are
 * skipped: their run is counted through its finish row.
 */
export async function findRunSamples(
  monitorId: string,
  options: { limit: number; before?: Date },
): Promise<{ receivedAt: Date; durationMs: number }[]> {
  const rows = db
    .select({ receivedAt: heartbeats.receivedAt, durationMs: heartbeats.durationMs })
    .from(heartbeats)
    .where(
      and(
        eq(heartbeats.monitorId, monitorId),
        isNotNull(heartbeats.durationMs),
        or(isNull(heartbeats.kind), ne(heartbeats.kind, "start")),
        options.before ? lt(heartbeats.receivedAt, options.before) : undefined,
      ),
    )
    .orderBy(desc(heartbeats.receivedAt))
    .limit(Math.min(options.limit, 1000))
    .all()
  return rows.flatMap((r) =>
    r.durationMs == null ? [] : [{ receivedAt: r.receivedAt, durationMs: r.durationMs }],
  )
}

export async function updateHeartbeatDuration(id: string, durationMs: number) {
  await db.update(heartbeats).set({ durationMs }).where(eq(heartbeats.id, id))
}

export async function deleteHeartbeatsOlderThan(cutoff: Date) {
  await db.delete(heartbeats).where(lte(heartbeats.receivedAt, cutoff))
}

type LatestHeartbeat = { receivedAt: Date; durationMs: number | null; exitCode: number | null }

/** Newest heartbeat per monitor; ranking and filtering happen in SQL. */
export async function findLatestHeartbeats(
  monitorIds: string[],
): Promise<Map<string, LatestHeartbeat>> {
  if (monitorIds.length === 0) return new Map()

  const ranked = db
    .select({
      monitorId: heartbeats.monitorId,
      receivedAt: heartbeats.receivedAt,
      durationMs: heartbeats.durationMs,
      exitCode: heartbeats.exitCode,
      rn: sql<number>`row_number() over (partition by ${heartbeats.monitorId} order by ${heartbeats.receivedAt} desc)`.as(
        "rn",
      ),
    })
    .from(heartbeats)
    .where(inArray(heartbeats.monitorId, monitorIds))
    .as("ranked")

  const rows = db.select().from(ranked).where(eq(ranked.rn, 1)).all()

  return new Map(
    rows.map((row) => [
      row.monitorId,
      { receivedAt: row.receivedAt, durationMs: row.durationMs, exitCode: row.exitCode },
    ]),
  )
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

/** One run plus its neighbours: the run before it and the last successful one before it. */
export async function findRunContext(monitorId: string, runId: string) {
  const run = db
    .select()
    .from(heartbeats)
    .where(and(eq(heartbeats.monitorId, monitorId), eq(heartbeats.id, runId)))
    .get()
  if (!run) return null

  const earlier = and(
    eq(heartbeats.monitorId, monitorId),
    lt(heartbeats.receivedAt, run.receivedAt),
  )
  const previous =
    db
      .select()
      .from(heartbeats)
      .where(earlier)
      .orderBy(desc(heartbeats.receivedAt))
      .limit(1)
      .get() ?? null
  const previousGood =
    db
      .select()
      .from(heartbeats)
      .where(and(earlier, or(isNull(heartbeats.exitCode), eq(heartbeats.exitCode, 0))))
      .orderBy(desc(heartbeats.receivedAt))
      .limit(1)
      .get() ?? null
  const next =
    db
      .select({ id: heartbeats.id })
      .from(heartbeats)
      .where(and(eq(heartbeats.monitorId, monitorId), gt(heartbeats.receivedAt, run.receivedAt)))
      .orderBy(asc(heartbeats.receivedAt))
      .limit(1)
      .get() ?? null

  return { run, previous, previousGood, nextId: next?.id ?? null }
}
