import { findAllMonitors, findMonitorByToken } from "@cronko/database/queries/monitors"
import { findAllStatusPages } from "@cronko/database/queries/status-pages"
import { Hono } from "hono"
import { monitorBadge, renderBadge, splitFormat, tagBadge } from "../services/badge"

/**
 * Public badges. A monitor badge is addressed by the monitor's secret token (as before);
 * a tag badge is public only while a status page for that tag is switched on, so a tag
 * never becomes visible by accident.
 */
export const badgeRoute = new Hono()

const CACHE = "public, max-age=60"

function respond(c: import("hono").Context, data: ReturnType<typeof tagBadge>, format: string) {
  const out = renderBadge(data, format as "svg" | "json" | "shields")
  return c.body(out.body, 200, { "Content-Type": out.contentType, "Cache-Control": CACHE })
}

// Registered before "/:token" so "tag" is never taken for a token.
badgeRoute.get("/tag/:tag", async (c) => {
  const { name: tag, format } = splitFormat(c.req.param("tag"))
  const published = (await findAllStatusPages()).some((p) => p.enabled && p.tag === tag)
  const statuses = published
    ? (await findAllMonitors()).filter((m) => m.tags.includes(tag)).map((m) => m.status)
    : []
  // Unknown, unpublished and empty tags answer the same, so nothing is revealed.
  if (!published || statuses.length === 0) return c.text("not found", 404)
  return respond(c, tagBadge(tag, statuses), format)
})

badgeRoute.get("/:token", async (c) => {
  const { name: token, format } = splitFormat(c.req.param("token"))
  const monitor = await findMonitorByToken(token)
  if (!monitor) return c.text("monitor not found", 404)
  const simple = c.req.query("states") === "simple"
  return respond(c, monitorBadge(monitor.status, simple), format)
})
