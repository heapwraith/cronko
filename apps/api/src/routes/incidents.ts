import { findIncidents } from "@cronko/database/queries/incidents"
import { Hono } from "hono"

export const incidentsRoute = new Hono()

incidentsRoute.get("/", async (c) => {
  const status = c.req.query("status") as "open" | "resolved" | undefined
  const limit = Math.min(Math.max(1, parseInt(c.req.query("limit") ?? "50", 10) || 50), 200)
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10) || 0)

  const result = await findIncidents({
    limit,
    offset,
    ...(status !== undefined && { status }),
  })
  return c.json({ data: result })
})
