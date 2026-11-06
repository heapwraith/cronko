import {
  createMaintenanceWindow,
  deleteMaintenanceWindow,
  findAllMaintenanceWindows,
  updateMaintenanceWindow,
} from "@cronko/database/queries/maintenance"
import { findMonitorById } from "@cronko/database/queries/monitors"
import { MAX_WINDOW_MINUTES, windowBounds } from "@cronko/shared/maintenance"
import { isValidSchedule, isValidTimezone } from "@cronko/shared/schedule"
import { normalizeTag, TAG_PATTERN } from "@cronko/shared/tags"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { z } from "zod"
import { logAuditEvent } from "../services/audit"

export const maintenanceRoute = new Hono()

export const base = z.object({
  name: z.string().trim().min(1).max(80),
  schedule: z.string().trim().min(1).max(100),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
  durationMinutes: z.number().int().min(1).max(MAX_WINDOW_MINUTES),
  target: z.enum(["all", "tag", "monitor"]),
  targetValue: z.string().trim().max(64).nullable().optional(),
  enabled: z.boolean().optional(),
})

type Body = z.infer<typeof base>

/** Cross-field checks shared by create and update. Returns an error message or null. */
export async function problem(b: Partial<Body>): Promise<string | null> {
  if (b.schedule !== undefined && !isValidSchedule(b.schedule, b.timezone ?? "UTC")) {
    return "Invalid schedule"
  }
  if (b.target === "tag") {
    const tag = normalizeTag(b.targetValue ?? "")
    if (!TAG_PATTERN.test(tag)) return "A tag is required"
  }
  if (b.target === "monitor" && !(b.targetValue && (await findMonitorById(b.targetValue)))) {
    return "Unknown monitor"
  }
  return null
}

export function targetValue(b: Pick<Body, "target" | "targetValue">): string | null {
  if (b.target === "all") return null
  if (b.target === "tag") return normalizeTag(b.targetValue ?? "")
  return b.targetValue ?? null
}

/** The window plus whether it is running now and when it next starts. */
function withBounds<T extends { schedule: string; timezone: string; durationMinutes: number }>(
  w: T,
  now = new Date(),
) {
  const { activeUntil, nextStart } = windowBounds(w, now)
  return {
    ...w,
    activeUntil: activeUntil?.toISOString() ?? null,
    nextStart: nextStart?.toISOString() ?? null,
  }
}

const userId = (c: { get: (k: "jwtPayload") => unknown }) =>
  (c.get("jwtPayload") as { sub: string })?.sub

maintenanceRoute.get("/", async (c) => {
  const now = new Date()
  return c.json({ data: (await findAllMaintenanceWindows()).map((w) => withBounds(w, now)) })
})

maintenanceRoute.post("/", zValidator("json", base), async (c) => {
  const body = c.req.valid("json")
  const error = await problem(body)
  if (error) return c.json({ error, code: "VALIDATION_ERROR" }, 400)
  const w = await createMaintenanceWindow({
    id: crypto.randomUUID(),
    name: body.name,
    schedule: body.schedule,
    timezone: body.timezone,
    durationMinutes: body.durationMinutes,
    target: body.target,
    targetValue: targetValue(body),
    enabled: body.enabled ?? true,
    now: new Date(),
  })
  logAuditEvent({
    userId: userId(c),
    action: "maintenance.created",
    resourceType: "maintenance_window",
    resourceId: w.id,
    metadata: { name: w.name, schedule: w.schedule, target: w.target },
  }).catch(() => {})
  return c.json({ data: withBounds(w) }, 201)
})

maintenanceRoute.patch("/:id", zValidator("json", base.partial()), async (c) => {
  const id = c.req.param("id")
  const body = c.req.valid("json")
  // Validate the result of the change, not just the fields sent.
  const current = (await findAllMaintenanceWindows()).find((w) => w.id === id)
  if (!current) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  const merged = { ...current, ...body } as Body
  const error = await problem(merged)
  if (error) return c.json({ error, code: "VALIDATION_ERROR" }, 400)

  const w = await updateMaintenanceWindow(id, {
    name: merged.name,
    schedule: merged.schedule,
    timezone: merged.timezone,
    durationMinutes: merged.durationMinutes,
    target: merged.target,
    targetValue: targetValue(merged),
    enabled: merged.enabled ?? current.enabled,
    now: new Date(),
  })
  if (!w) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  logAuditEvent({
    userId: userId(c),
    action: "maintenance.updated",
    resourceType: "maintenance_window",
    resourceId: id,
    metadata: body,
  }).catch(() => {})
  return c.json({ data: withBounds(w) })
})

maintenanceRoute.delete("/:id", async (c) => {
  const id = c.req.param("id")
  if (!(await deleteMaintenanceWindow(id))) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  }
  logAuditEvent({
    userId: userId(c),
    action: "maintenance.deleted",
    resourceType: "maintenance_window",
    resourceId: id,
  }).catch(() => {})
  return c.json({ data: { ok: true } })
})
