import { and, desc, eq } from "drizzle-orm"
import { db } from "../index"
import { incidents } from "../schema"

export async function findIncidents(options: {
  status?: "open" | "resolved"
  limit: number
  offset: number
}) {
  return db
    .select()
    .from(incidents)
    .where(options.status ? eq(incidents.status, options.status) : undefined)
    .orderBy(desc(incidents.startedAt))
    .limit(Math.min(options.limit, 200))
    .offset(options.offset)
    .all()
}

export async function findIncidentsByMonitor(
  monitorId: string,
  options: { limit: number; offset: number },
) {
  return db
    .select()
    .from(incidents)
    .where(eq(incidents.monitorId, monitorId))
    .orderBy(desc(incidents.startedAt))
    .limit(Math.min(options.limit, 200))
    .offset(options.offset)
    .all()
}

export async function findOpenIncident(monitorId: string) {
  return db
    .select()
    .from(incidents)
    .where(and(eq(incidents.monitorId, monitorId), eq(incidents.status, "open")))
    .get()
}

export async function createIncident(input: { id: string; monitorId: string; startedAt: Date }) {
  await db.insert(incidents).values({
    id: input.id,
    monitorId: input.monitorId,
    status: "open",
    startedAt: input.startedAt,
  })
}

export async function resolveIncident(id: string, resolvedAt: Date) {
  await db.update(incidents).set({ status: "resolved", resolvedAt }).where(eq(incidents.id, id))
}
