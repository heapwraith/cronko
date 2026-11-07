import { Hono } from "hono"
import { logAuditEvent } from "../services/audit"
import { buildExport } from "../services/cronko-export"

export const exportRoute = new Hono()

/**
 * Configuration as JSON (no heartbeat history, no ping tokens). Channel secrets
 * are redacted unless `?includeSecrets=true`, which needs a browser session: an
 * API token, whatever its scope, never gets them.
 */
exportRoute.get("/", async (c) => {
  const includeSecrets = c.req.query("includeSecrets") === "true"
  if (includeSecrets && (c.get("apiToken" as never) as unknown)) {
    return c.json(
      { error: "Secrets can only be exported with a session, not an API token", code: "FORBIDDEN" },
      403,
    )
  }
  const doc = await buildExport(includeSecrets)
  const userId = (c.get("jwtPayload") as { sub: string } | undefined)?.sub
  logAuditEvent({
    ...(userId && { userId }),
    action: includeSecrets ? "config.exported_with_secrets" : "config.exported",
    resourceType: "config",
    metadata: {
      includeSecrets,
      monitors: doc.monitors.length,
      channels: doc.channels.length,
      viaApiToken: Boolean(c.get("apiToken" as never)),
    },
  }).catch(() => {})
  c.header("Content-Disposition", 'attachment; filename="cronko-export.json"')
  return c.json(doc)
})
