import { findStatusPageBySlug } from "@cronko/database/queries/status-pages"
import { STATUS_SLUG_PATTERN } from "@cronko/shared/status"
import { Hono } from "hono"
import { clientIp } from "../lib/clientIp"
import { createRateLimiter } from "../middleware/rateLimit"
import { buildPublicStatus } from "../services/status-page"

/** Public, read-only status data. No authentication: expose nothing beyond PublicStatus. */
export const publicStatusRoute = new Hono()

publicStatusRoute.use("*", createRateLimiter({ limit: 120, key: (c) => `status:${clientIp(c)}` }))

publicStatusRoute.get("/:slug", async (c) => {
  const slug = c.req.param("slug")
  // Missing and disabled pages answer the same, so pages cannot be probed.
  const page = STATUS_SLUG_PATTERN.test(slug) ? await findStatusPageBySlug(slug) : undefined
  if (!page?.enabled) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)

  c.header("Cache-Control", "public, max-age=30")
  return c.json({ data: await buildPublicStatus(page) })
})
