import type { InferSelectModel } from "drizzle-orm"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { db } from "@cronko/database"
import { zValidator } from "@hono/zod-validator"
import { monitors as monitorsTable } from "@cronko/database/schema"
import {
  findAllMonitors,
  findMonitorById,
  findMonitorBySlug,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  pauseMonitor,
  resumeMonitor,
} from "@cronko/database/queries/monitors"
import { findHeartbeatsByMonitor, findLatestHeartbeats } from "@cronko/database/queries/heartbeats"
import { findOpenIncident, findIncidentsByMonitor } from "@cronko/database/queries/incidents"
import { DEFAULT_GRACE_PERIOD_SECONDS } from "@cronko/shared/constants"
import { logAuditEvent } from "../services/audit"

type MonitorRow = InferSelectModel<typeof monitorsTable>

export const monitorsRoute = new Hono()

const pathParamSchema = z.object({
  id: z.string().min(1),
})

const createMonitorSchema = z.object({
  name: z.string().min(1).max(100),
  expectedIntervalSeconds: z.number().int().min(10).max(31_536_000),
  gracePeriodSeconds: z
    .number()
    .int()
    .min(0)
    .max(86_400)
    .default(DEFAULT_GRACE_PERIOD_SECONDS),
  maxDurationMs: z.number().int().min(0).max(86_400_000).optional(),
})

const updateMonitorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  expectedIntervalSeconds: z.number().int().min(10).max(31_536_000).optional(),
  gracePeriodSeconds: z.number().int().min(0).max(86_400).optional(),
  maxDurationMs: z.number().int().min(0).max(86_400_000).optional(),
})

monitorsRoute.get("/", async (c) => {
  const monitors = await findAllMonitors()

  const ids = monitors.map((m: MonitorRow) => m.id)
  const heartbeats = await findLatestHeartbeats(ids)

  const monitorsWithHeartbeat = monitors.map((m: MonitorRow) => {
    const hb = heartbeats.get(m.id)
    return {
      ...m,
      latestHeartbeat: hb
        ? {
            receivedAt: hb.receivedAt.toISOString(),
            durationMs: hb.durationMs,
          }
        : null,
    }
  })

  return c.json({ data: monitorsWithHeartbeat })
})

monitorsRoute.post("/", zValidator("json", createMonitorSchema), async (c) => {
  const body = c.req.valid("json")
  const slug = body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  const existing = await findMonitorBySlug(slug)
  if (existing) {
    return c.json(
      {
        error: "A monitor with this name already exists",
        code: "CONFLICT",
      },
      409,
    )
  }

    const now = new Date()
    const monitor = await createMonitor({
    id: crypto.randomUUID(),
    name: body.name,
    slug,
    token: crypto.randomUUID(),
    expectedIntervalSeconds: body.expectedIntervalSeconds,
      gracePeriodSeconds: body.gracePeriodSeconds,
      ...(body.maxDurationMs !== undefined && { maxDurationMs: body.maxDurationMs }),
      now,
  })

  logAuditEvent({
    userId: (c.get("jwtPayload") as { sub: string })?.sub,
    action: "monitor.created",
    resourceType: "monitor",
    resourceId: monitor.id,
    metadata: { name: body.name },
  }).catch(() => {})

  return c.json({ data: monitor }, 201)
})

monitorsRoute.get("/:id", async (c) => {
  const { id } = pathParamSchema.parse({ id: c.req.param("id") })
  const monitor = await findMonitorById(id)

  if (!monitor) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  }

  const recentHeartbeats = await findHeartbeatsByMonitor(id, { limit: 20 })
  const openIncident = await findOpenIncident(id)

  return c.json({
    data: {
      ...monitor,
      recentHeartbeats,
      openIncident,
    },
  })
})

monitorsRoute.patch(
  "/:id",
  zValidator("json", updateMonitorSchema),
  async (c) => {
    const { id } = pathParamSchema.parse({ id: c.req.param("id") })
    const body = c.req.valid("json")
    const now = new Date()

    const updated = await updateMonitor(id, {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.expectedIntervalSeconds !== undefined && {
        expectedIntervalSeconds: body.expectedIntervalSeconds,
      }),
      ...(body.gracePeriodSeconds !== undefined && {
        gracePeriodSeconds: body.gracePeriodSeconds,
      }),
      ...(body.maxDurationMs !== undefined && { maxDurationMs: body.maxDurationMs }),
      now,
    })

    if (!updated) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    }

    return c.json({ data: updated })
  },
)

monitorsRoute.delete("/:id", async (c) => {
  const { id } = pathParamSchema.parse({ id: c.req.param("id") })
  await deleteMonitor(id)
  logAuditEvent({
    userId: (c.get("jwtPayload") as { sub: string })?.sub,
    action: "monitor.deleted",
    resourceType: "monitor",
    resourceId: id,
  }).catch(() => {})
  return c.json({ data: { ok: true } })
})

monitorsRoute.post("/:id/pause", async (c) => {
  const id = c.req.param("id") ?? ""
  const monitor = await pauseMonitor(id)

  if (!monitor) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  }

  return c.json({ data: monitor })
})

monitorsRoute.post("/:id/resume", async (c) => {
  const id = c.req.param("id") ?? ""
  const monitor = await resumeMonitor(id)

  if (!monitor) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  }

  return c.json({ data: monitor })
})

monitorsRoute.post("/reorder", zValidator("json", z.object({ ids: z.array(z.string()) })), async (c) => {
  const { ids } = c.req.valid("json")
  const now = new Date()
  for (let i = 0; i < ids.length; i++) {
      const currentId = ids[i]
      if (!currentId) continue
      await db.update(monitorsTable).set({ displayOrder: i, updatedAt: now }).where(eq(monitorsTable.id, currentId))
  }
  return c.json({ data: { ok: true } })
})

monitorsRoute.get("/:id/incidents", async (c) => {
  const id = c.req.param("id") ?? ""
  const limit = Math.min(
    Math.max(1, parseInt(c.req.query("limit") ?? "50", 10) || 50),
    200,
  )
  const offset = Math.max(
    0,
    parseInt(c.req.query("offset") ?? "0", 10) || 0,
  )

  const result = await findIncidentsByMonitor(id, { limit, offset })
  return c.json({ data: result })
})

monitorsRoute.get("/:id/heartbeats", async (c) => {
  const id = c.req.param("id") ?? ""
  const limit = Math.min(
    Math.max(1, parseInt(c.req.query("limit") ?? "100", 10) || 100),
    500,
  )
  const before = c.req.query("before")

  const heartbeats = await findHeartbeatsByMonitor(id, {
    limit,
    ...(before !== undefined && { before }),
  })

  const format = c.req.query("format")
  if (format === "csv") {
    const csvLines = ["time,duration_ms,exit_code,source_ip,body"]
    for (const hb of heartbeats) {
      const row = [
        hb.receivedAt.toISOString(),
        hb.durationMs ?? "",
        hb.exitCode ?? "",
        hb.sourceIp ?? "",
        (hb.body ?? "").replace(/"/g, '""'),
      ].map((v) => `"${v}"`).join(",")
      csvLines.push(row)
    }
    return c.text(csvLines.join("\n"), 200, { "Content-Type": "text/csv; charset=utf-8" })
  }

  return c.json({ data: heartbeats })
})