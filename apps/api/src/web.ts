import { existsSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { serveStatic } from "@hono/node-server/serve-static"
import type { Env, Hono } from "hono"
import { env } from "./env"
import { logger } from "./lib/logger"

// Paths owned by the API; unknown ones must 404 as JSON, not fall back to the SPA.
const API_PREFIXES = ["/api/", "/auth/", "/ping/", "/badge/", "/health", "/openapi.json", "/docs"]

function findWebDist(): string | undefined {
  const candidates = [
    env.WEB_DIST,
    "web", // Docker image: /app/web
    "apps/web/dist", // repo root
    "../web/dist", // apps/api
  ].filter((p): p is string => Boolean(p))

  return candidates.map((p) => resolve(p)).find((p) => existsSync(join(p, "index.html")))
}

/** Serve the built web app (and the SPA fallback) from the API process. */
export function registerWeb<E extends Env>(app: Hono<E>) {
  const dir = findWebDist()
  if (!dir) {
    logger.warn("web build not found; serving the API only (run `pnpm --filter @cronko/web build`)")
    return
  }

  const indexHtml = readFileSync(join(dir, "index.html"), "utf8")
  const root = relative(process.cwd(), dir) || "."

  // Vite fingerprints everything under /assets, so it can be cached forever.
  app.use("/assets/*", async (c, next) => {
    await next()
    if (c.res.ok) c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable")
  })
  app.use("*", serveStatic({ root }))

  app.get("*", (c) => {
    if (API_PREFIXES.some((p) => c.req.path === p || c.req.path.startsWith(p))) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    }
    c.header("Cache-Control", "no-cache")
    return c.html(indexHtml)
  })

  logger.info({ dir }, "serving web app")
}
