import { db } from "@cronko/database"
import { auditLogs } from "@cronko/database/schema"
import { desc, lt } from "drizzle-orm"
import { Hono } from "hono"

export const auditRoute = new Hono()

auditRoute.get("/", async (c) => {
  const limit = Math.min(Math.max(1, parseInt(c.req.query("limit") ?? "50", 10) || 50), 200)
  const before = c.req.query("before")

  const conditions = before ? lt(auditLogs.createdAt, before) : undefined

  const rows = await db
    .select()
    .from(auditLogs)
    .where(conditions)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)

  return c.json({
    data: rows.map((row: typeof auditLogs.$inferSelect) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    })),
  })
})
