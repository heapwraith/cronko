import { relations, sql } from "drizzle-orm"
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const monitors = sqliteTable("monitors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  token: text("token").notNull().unique(),
  status: text("status", {
    enum: ["healthy", "missed", "down", "failed", "paused", "pending"],
  })
    .notNull()
    .default("healthy"),
  expectedIntervalSeconds: integer("expected_interval_seconds").notNull(),
  gracePeriodSeconds: integer("grace_period_seconds").notNull().default(300),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  maxDurationMs: integer("max_duration_ms"),
  // Optional cron schedule (5 fields or @nickname) evaluated in `timezone` (IANA).
  // When set, deadlines come from the next scheduled run, not from the last ping.
  scheduleCron: text("schedule_cron"),
  timezone: text("timezone"),
  // Short labels for filtering and grouping, normalized by @cronko/shared/tags.
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  // Ping by e-mail: a subject containing any of these (case-insensitive) is a failure.
  emailFailureKeywords: text("email_failure_keywords", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  // Opt-in: also alert on runs much slower than usual and on overlapping runs.
  alertOnAnomalies: integer("alert_on_anomalies", { mode: "boolean" }).notNull().default(false),
  // Alerts are silenced until this moment; state and incidents are still tracked.
  mutedUntil: integer("muted_until", { mode: "timestamp" }),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const heartbeats = sqliteTable(
  "heartbeats",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    receivedAt: integer("received_at", { mode: "timestamp" }).notNull(),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    durationMs: integer("duration_ms"),
    exitCode: integer("exit_code"),
    body: text("body"),
    // "start" / "finish" for the two halves of a /start + /finish run; null for a plain ping.
    kind: text("kind", { enum: ["start", "finish"] }),
    // This run started while the previous one had not reported its finish yet.
    overlapped: integer("overlapped", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("heartbeats_monitor_received_idx").on(t.monitorId, t.receivedAt)],
)

export const incidents = sqliteTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["open", "resolved"] })
      .notNull()
      .default("open"),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  },
  (t) => [index("incidents_monitor_status_idx").on(t.monitorId, t.status)],
)

export const notificationChannels = sqliteTable("notification_channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", {
    enum: [
      "discord",
      "telegram",
      "email",
      "slack",
      "webhook",
      "ntfy",
      "pushover",
      "teams",
      "pagerduty",
    ],
  }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  config: text("config", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

/**
 * Outbox of alerts. A row is written when a transition happens and a worker
 * delivers it with retries, so a flaky webhook or a restart never loses an alert.
 */
export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => notificationChannels.id, { onDelete: "cascade" }),
    monitorName: text("monitor_name").notNull(),
    event: text("event", {
      enum: ["missed", "down", "failed", "recovered", "slow", "unusual", "overlap", "digest"],
    }).notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp" }).notNull(),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("notification_deliveries_due_idx").on(t.status, t.nextAttemptAt),
    index("notification_deliveries_created_idx").on(t.createdAt),
  ],
)

export const monitorsRelations = relations(monitors, ({ many }) => ({
  heartbeats: many(heartbeats),
  incidents: many(incidents),
}))

export const heartbeatsRelations = relations(heartbeats, ({ one }) => ({
  monitor: one(monitors, {
    fields: [heartbeats.monitorId],
    references: [monitors.id],
  }),
}))

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

/**
 * Denylist of session JWT ids (`jti`) revoked at logout. Rows can be dropped once
 * `expiresAt` passes, because the token itself would be rejected by then anyway.
 */
export const revokedTokens = sqliteTable(
  "revoked_tokens",
  {
    jti: text("jti").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("revoked_tokens_expires_idx").on(t.expiresAt)],
)

/**
 * User-created API tokens for scripts and CI. Only the SHA-256 of the token is
 * stored; `prefix` (first characters) lets the owner recognise it in the list.
 */
export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    scope: text("scope", { enum: ["read", "write"] }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("api_tokens_token_hash_unique").on(t.tokenHash)],
)

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  metadata: text("metadata"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull(),
})

export const incidentsRelations = relations(incidents, ({ one }) => ({
  monitor: one(monitors, {
    fields: [incidents.monitorId],
    references: [monitors.id],
  }),
}))

/** A public, read-only status page showing the monitors that carry one tag. */
export const statusPages = sqliteTable("status_pages", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  tag: text("tag").notNull(),
  // Off until switched on: nothing becomes public by accident.
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

/**
 * Recurring maintenance: alerts for the targeted monitors are held back while a
 * window runs. `schedule` is a cron start in `timezone`; see @cronko/shared/maintenance.
 */
export const maintenanceWindows = sqliteTable("maintenance_windows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  schedule: text("schedule").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  durationMinutes: integer("duration_minutes").notNull(),
  target: text("target", { enum: ["all", "tag", "monitor"] }).notNull(),
  targetValue: text("target_value"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})
