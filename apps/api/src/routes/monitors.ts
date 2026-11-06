import { db } from "@cronko/database"
import {
  findHeartbeatsByMonitor,
  findLatestHeartbeats,
  findRunContext,
  findRunSamples,
} from "@cronko/database/queries/heartbeats"
import { findIncidentsByMonitor, findOpenIncident } from "@cronko/database/queries/incidents"
import {
  createMonitor,
  deleteMonitor,
  findAllMonitors,
  findMonitorById,
  findMonitorBySlug,
  pauseMonitor,
  resumeMonitor,
  setMonitorMutedUntil,
  updateMonitor,
} from "@cronko/database/queries/monitors"
import { monitors as monitorsTable } from "@cronko/database/schema"
import { DEFAULT_GRACE_PERIOD_SECONDS } from "@cronko/shared/constants"
import {
  MAX_EMAIL_KEYWORD_LENGTH,
  MAX_EMAIL_KEYWORDS,
  normalizeEmailKeywords,
} from "@cronko/shared/email-ping"
import {
  BASELINE_RUNS,
  durationStats,
  isRunSample,
  isUnusuallySlow,
} from "@cronko/shared/run-stats"
import { isValidSchedule, isValidTimezone, schedulePeriodSeconds } from "@cronko/shared/schedule"
import { MAX_TAGS, normalizeTags } from "@cronko/shared/tags"
import { zValidator } from "@hono/zod-validator"
import type { InferSelectModel } from "drizzle-orm"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { logAuditEvent } from "../services/audit"
import { expectedWindow } from "../services/monitor-state"

type MonitorRow = InferSelectModel<typeof monitorsTable>

export const monitorsRoute = new Hono()

const pathParamSchema = z.object({
  id: z.string().min(1),
})

const timezoneSchema = z.string().refine(isValidTimezone, {
  message: "Unknown timezone (use an IANA name, e.g. America/Sao_Paulo)",
})

/** Shared cross-field rule: a cron expression must parse in its timezone. */
function checkSchedule(
  v: { scheduleCron?: string | null | undefined; timezone?: string | null | undefined },
  ctx: z.RefinementCtx,
) {
  if (v.scheduleCron && !isValidSchedule(v.scheduleCron, v.timezone)) {
    ctx.addIssue({
      code: "custom",
      path: ["scheduleCron"],
      message: "Invalid cron expression (5 fields or an @nickname)",
    })
  }
}

/** Accepts free-form labels and stores them normalized (see @cronko/shared/tags). */
const tagsSchema = z
  .array(z.string().max(64))
  .max(MAX_TAGS * 2)
  .transform((tags) => normalizeTags(tags))

const createMonitorSchema = z
  .object({
    name: z.string().min(1).max(100),
    expectedIntervalSeconds: z.number().int().min(10).max(31_536_000).optional(),
    scheduleCron: z.string().trim().min(1).max(100).optional(),
    timezone: timezoneSchema.optional(),
    gracePeriodSeconds: z.number().int().min(0).max(86_400).default(DEFAULT_GRACE_PERIOD_SECONDS),
    maxDurationMs: z.number().int().min(0).max(86_400_000).optional(),
    alertOnAnomalies: z.boolean().optional(),
    emailFailureKeywords: z
      .array(z.string().max(MAX_EMAIL_KEYWORD_LENGTH))
      .max(MAX_EMAIL_KEYWORDS)
      .optional(),
    tags: tagsSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.expectedIntervalSeconds === undefined && !v.scheduleCron) {
      ctx.addIssue({
        code: "custom",
        path: ["expectedIntervalSeconds"],
        message: "Provide expectedIntervalSeconds or scheduleCron",
      })
    }
    checkSchedule(v, ctx)
  })

const updateMonitorSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    expectedIntervalSeconds: z.number().int().min(10).max(31_536_000).optional(),
    /** null switches back to a plain interval. */
    scheduleCron: z.string().trim().min(1).max(100).nullable().optional(),
    timezone: timezoneSchema.nullable().optional(),
    gracePeriodSeconds: z.number().int().min(0).max(86_400).optional(),
    maxDurationMs: z.number().int().min(0).max(86_400_000).optional(),
    alertOnAnomalies: z.boolean().optional(),
    emailFailureKeywords: z
      .array(z.string().max(MAX_EMAIL_KEYWORD_LENGTH))
      .max(MAX_EMAIL_KEYWORDS)
      .optional(),
    tags: tagsSchema.optional(),
  })
  .superRefine(checkSchedule)

/** A cron monitor's interval is the gap between its scheduled runs. */
function intervalFor(cron: string, timezone: string | undefined, fallback: number | undefined) {
  return schedulePeriodSeconds(cron, timezone, new Date()) ?? fallback ?? 86_400
}

monitorsRoute.get("/", async (c) => {
  const tag = c.req.query("tag")
  const all = await findAllMonitors()
  const monitors = tag ? all.filter((m) => m.tags.includes(tag.trim().toLowerCase())) : all

  const ids = monitors.map((m: MonitorRow) => m.id)
  const heartbeats = await findLatestHeartbeats(ids)

  const monitorsWithHeartbeat = monitors.map((m: MonitorRow) => {
    const hb = heartbeats.get(m.id)
    return {
      ...m,
      nextExpectedAt: m.paused
        ? null
        : expectedWindow(m, hb?.receivedAt).nextExpected.toISOString(),
      latestHeartbeat: hb
        ? {
            receivedAt: hb.receivedAt.toISOString(),
            durationMs: hb.durationMs,
            exitCode: hb.exitCode,
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
    expectedIntervalSeconds: body.scheduleCron
      ? intervalFor(body.scheduleCron, body.timezone, body.expectedIntervalSeconds)
      : (body.expectedIntervalSeconds as number),
    gracePeriodSeconds: body.gracePeriodSeconds,
    ...(body.maxDurationMs !== undefined && { maxDurationMs: body.maxDurationMs }),
    ...(body.alertOnAnomalies !== undefined && { alertOnAnomalies: body.alertOnAnomalies }),
    ...(body.emailFailureKeywords !== undefined && {
      emailFailureKeywords: normalizeEmailKeywords(body.emailFailureKeywords),
    }),
    ...(body.tags !== undefined && { tags: body.tags }),
    ...(body.scheduleCron && {
      scheduleCron: body.scheduleCron,
      timezone: body.timezone ?? "UTC",
    }),
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

  const recent = await findHeartbeatsByMonitor(id, { limit: 20 })
  // One query covers the baseline of every listed run: each run is compared with
  // the runs before it, never with itself.
  const samples = await findRunSamples(id, { limit: BASELINE_RUNS + recent.length })
  const recentHeartbeats = recent.map((hb) => {
    if (!isRunSample(hb)) return { ...hb, unusuallySlow: false }
    const earlier = samples
      .filter((s) => s.receivedAt < hb.receivedAt)
      .slice(0, BASELINE_RUNS)
      .map((s) => s.durationMs)
    return { ...hb, unusuallySlow: isUnusuallySlow(hb.durationMs, durationStats(earlier)) }
  })
  const typical = durationStats(samples.slice(0, BASELINE_RUNS).map((s) => s.durationMs))
  const openIncident = await findOpenIncident(id)

  return c.json({
    data: {
      ...monitor,
      nextExpectedAt: monitor.paused
        ? null
        : expectedWindow(monitor, recentHeartbeats[0]?.receivedAt).nextExpected.toISOString(),
      recentHeartbeats,
      typical,
      openIncident,
    },
  })
})

monitorsRoute.patch("/:id", zValidator("json", updateMonitorSchema), async (c) => {
  const { id } = pathParamSchema.parse({ id: c.req.param("id") })
  const body = c.req.valid("json")
  const now = new Date()

  const cronChange =
    body.scheduleCron === null
      ? { scheduleCron: null, timezone: null }
      : body.scheduleCron
        ? { scheduleCron: body.scheduleCron, timezone: body.timezone ?? "UTC" }
        : {}

  const updated = await updateMonitor(id, {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.scheduleCron
      ? {
          expectedIntervalSeconds: intervalFor(
            body.scheduleCron,
            body.timezone ?? undefined,
            body.expectedIntervalSeconds,
          ),
        }
      : body.expectedIntervalSeconds !== undefined && {
          expectedIntervalSeconds: body.expectedIntervalSeconds,
        }),
    ...cronChange,
    ...(body.gracePeriodSeconds !== undefined && {
      gracePeriodSeconds: body.gracePeriodSeconds,
    }),
    ...(body.maxDurationMs !== undefined && { maxDurationMs: body.maxDurationMs }),
    ...(body.alertOnAnomalies !== undefined && { alertOnAnomalies: body.alertOnAnomalies }),
    ...(body.emailFailureKeywords !== undefined && {
      emailFailureKeywords: normalizeEmailKeywords(body.emailFailureKeywords),
    }),
    ...(body.tags !== undefined && { tags: body.tags }),
    now,
  })

  if (!updated) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  }

  return c.json({ data: updated })
})

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

/** Silence alerts for a while (maintenance). `minutes: null` unmutes. */
monitorsRoute.post(
  "/:id/mute",
  zValidator(
    "json",
    z.object({
      minutes: z
        .number()
        .int()
        .min(1)
        .max(60 * 24 * 30)
        .nullable(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id") ?? ""
    const { minutes } = c.req.valid("json")
    const until = minutes === null ? null : new Date(Date.now() + minutes * 60_000)
    const monitor = await setMonitorMutedUntil(id, until)
    if (!monitor) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)

    logAuditEvent({
      userId: (c.get("jwtPayload") as { sub: string })?.sub,
      action: until ? "monitor.muted" : "monitor.unmuted",
      resourceType: "monitor",
      resourceId: id,
      metadata: { until: until?.toISOString() ?? null },
    }).catch(() => {})

    return c.json({ data: monitor })
  },
)

monitorsRoute.post(
  "/reorder",
  zValidator("json", z.object({ ids: z.array(z.string()) })),
  async (c) => {
    const { ids } = c.req.valid("json")
    const now = new Date()
    for (let i = 0; i < ids.length; i++) {
      const currentId = ids[i]
      if (!currentId) continue
      await db
        .update(monitorsTable)
        .set({ displayOrder: i, updatedAt: now })
        .where(eq(monitorsTable.id, currentId))
    }
    return c.json({ data: { ok: true } })
  },
)

monitorsRoute.get("/:id/incidents", async (c) => {
  const id = c.req.param("id") ?? ""
  const limit = Math.min(Math.max(1, parseInt(c.req.query("limit") ?? "50", 10) || 50), 200)
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10) || 0)

  const result = await findIncidentsByMonitor(id, { limit, offset })
  return c.json({ data: result })
})

monitorsRoute.get("/:id/runs/:runId", async (c) => {
  const ctx = await findRunContext(c.req.param("id") ?? "", c.req.param("runId") ?? "")
  if (!ctx) return c.json({ error: "Run not found", code: "NOT_FOUND" }, 404)

  // Baseline: the runs before this one, so a slow run does not dilute its own yardstick.
  const earlier = await findRunSamples(ctx.run.monitorId, {
    limit: BASELINE_RUNS,
    before: ctx.run.receivedAt,
  })
  const typical = durationStats(earlier.map((s) => s.durationMs))
  const unusuallySlow = isRunSample(ctx.run) && isUnusuallySlow(ctx.run.durationMs, typical)
  return c.json({ data: { ...ctx, typical, unusuallySlow } })
})

monitorsRoute.get("/:id/heartbeats", async (c) => {
  const id = c.req.param("id") ?? ""
  const limit = Math.min(Math.max(1, parseInt(c.req.query("limit") ?? "100", 10) || 100), 500)
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
      ]
        .map((v) => `"${v}"`)
        .join(",")
      csvLines.push(row)
    }
    return c.text(csvLines.join("\n"), 200, { "Content-Type": "text/csv; charset=utf-8" })
  }

  return c.json({ data: heartbeats })
})
