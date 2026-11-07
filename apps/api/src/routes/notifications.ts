import {
  createNotificationChannel,
  deleteNotificationChannel,
  findAllNotificationChannels,
  findNotificationChannelById,
  findRecentDeliveries,
  updateNotificationChannel,
} from "@cronko/database/queries/notifications"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { z } from "zod"
import { logAuditEvent } from "../services/audit"
import { sendTestNotification } from "../services/notifier"
import {
  MAX_TEMPLATE_LENGTH,
  maskHeaders,
  parseHeaders,
  unknownPlaceholders,
  unmaskHeaders,
} from "../services/webhook-template"

export const notificationsRoute = new Hono()

const httpUrl = z.url({ protocol: /^https?$/ })
const webhookConfig = z
  .object({
    url: httpUrl,
    headers: z.string().max(4000).optional(),
    bodyTemplate: z.string().max(MAX_TEMPLATE_LENGTH).optional(),
  })
  .superRefine((cfg, ctx) => {
    const { error } = parseHeaders(cfg.headers)
    if (error) ctx.addIssue({ code: "custom", path: ["headers"], message: error })
    const bad = unknownPlaceholders(cfg.bodyTemplate ?? "")
    if (bad.length) {
      ctx.addIssue({
        code: "custom",
        path: ["bodyTemplate"],
        message: `Unknown placeholder: ${bad.map((b) => `{{${b}}}`).join(", ")}`,
      })
    }
  })

/** Header values are secrets: responses carry them masked. */
function redact<T extends { type: string; config: unknown }>(channel: T): T {
  if (channel.type !== "webhook") return channel
  const cfg = channel.config as { headers?: string }
  if (!cfg.headers) return channel
  return { ...channel, config: { ...cfg, headers: maskHeaders(cfg.headers) } }
}
const ntfyConfig = z.object({
  topic: z.string().regex(/^[\w-]{1,64}$/, "Use letters, digits, - or _"),
  serverUrl: z.union([httpUrl, z.literal("")]).optional(),
  token: z.string().optional(),
})

// Pushover tokens and user keys are 30 alphanumeric characters.
const pushoverKey = z.string().regex(/^[A-Za-z0-9]{30}$/, "Expected 30 letters or digits")
const pushoverConfig = z.object({ appToken: pushoverKey, userKey: pushoverKey })

// Events API v2 integration keys are 32 hex-like characters.
const pagerDutyConfig = z.object({
  routingKey: z.string().regex(/^[A-Za-z0-9]{32}$/, "Expected 32 letters or digits"),
})

export const createNotificationSchema = z.discriminatedUnion("type", [
  z.object({
    name: z.string().min(1),
    type: z.literal("discord"),
    config: z.object({ webhookUrl: z.url() }),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("telegram"),
    config: z.object({ botToken: z.string().min(1), chatId: z.string().min(1) }),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("email"),
    config: z.object({ to: z.email() }),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("slack"),
    config: z.object({ webhookUrl: z.url() }),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("webhook"),
    config: webhookConfig,
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("ntfy"),
    config: ntfyConfig,
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("pushover"),
    config: pushoverConfig,
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("pagerduty"),
    config: pagerDutyConfig,
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("teams"),
    config: z.object({ webhookUrl: z.url() }),
  }),
])

const updateNotificationSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  config: z
    .union([
      z.object({ webhookUrl: z.url() }),
      z.object({ botToken: z.string().min(1), chatId: z.string().min(1) }),
      z.object({ to: z.email() }),
      webhookConfig,
      ntfyConfig,
      pushoverConfig,
      pagerDutyConfig,
    ])
    .optional(),
})

notificationsRoute.get("/deliveries", async (c) => {
  const limit = Math.min(Math.max(1, Number.parseInt(c.req.query("limit") ?? "50", 10) || 50), 200)
  return c.json({ data: await findRecentDeliveries(limit) })
})

notificationsRoute.get("/", async (c) => {
  const channels = await findAllNotificationChannels()
  return c.json({ data: channels.map(redact) })
})

notificationsRoute.post("/", zValidator("json", createNotificationSchema), async (c) => {
  const body = c.req.valid("json")
  const channel = await createNotificationChannel({
    id: crypto.randomUUID(),
    name: body.name,
    type: body.type,
    enabled: true,
    config: body.config,
  })

  logAuditEvent({
    userId: (c.get("jwtPayload") as { sub: string })?.sub,
    action: "notification.created",
    resourceType: "notification",
    resourceId: channel.id,
    metadata: { name: body.name, type: body.type },
  }).catch(() => {})

  return c.json({ data: redact(channel) }, 201)
})

notificationsRoute.patch("/:id", zValidator("json", updateNotificationSchema), async (c) => {
  const id = c.req.param("id") ?? ""
  const body = c.req.valid("json")

  let config = body.config
  if (config && "headers" in config && config.headers) {
    const existing = await findNotificationChannelById(id)
    const stored = (existing?.config as { headers?: string } | undefined)?.headers
    config = { ...config, headers: unmaskHeaders(config.headers, stored) }
  }

  const updated = await updateNotificationChannel(id, {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.enabled !== undefined && { enabled: body.enabled }),
    ...(config !== undefined && { config }),
  })

  if (!updated) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  }

  return c.json({ data: redact(updated) })
})

notificationsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id") ?? ""
  await deleteNotificationChannel(id)
  logAuditEvent({
    userId: (c.get("jwtPayload") as { sub: string })?.sub,
    action: "notification.deleted",
    resourceType: "notification",
    resourceId: id,
  }).catch(() => {})
  return c.json({ data: { ok: true } })
})

notificationsRoute.post("/:id/test", async (c) => {
  const id = c.req.param("id") ?? ""
  const channel = await findNotificationChannelById(id)

  if (!channel) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  }

  const result = await sendTestNotification(channel)
  return c.json({ data: result }, result.ok ? 200 : 502)
})
