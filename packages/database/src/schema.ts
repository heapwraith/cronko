import { relations } from "drizzle-orm"
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const monitors = sqliteTable("monitors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  token: text("token").notNull().unique(),
  status: text("status", {
    enum: ["healthy", "missed", "down", "paused", "pending"],
  })
    .notNull()
    .default("healthy"),
  expectedIntervalSeconds: integer("expected_interval_seconds").notNull(),
  gracePeriodSeconds: integer("grace_period_seconds").notNull().default(300),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  maxDurationMs: integer("max_duration_ms"),
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
  type: text("type", { enum: ["discord", "telegram", "email", "slack"] }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  config: text("config", { mode: "json" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

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
