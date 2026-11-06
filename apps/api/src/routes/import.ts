import { Hono } from "hono"
import { logAuditEvent } from "../services/audit"
import {
  extractHealthchecksChecks,
  type ImportCandidate,
  mapHealthchecks,
  mapKuma,
  runImport,
} from "../services/importers"

export const importRoute = new Hono()

const DEFAULT_HEALTHCHECKS_URL = "https://healthchecks.io"

const bad = (message: string) => ({ error: message, code: "VALIDATION_ERROR" })

async function finish(
  c: { get: (k: string) => unknown },
  source: string,
  candidates: ImportCandidate[],
  dryRun: boolean,
) {
  const report = await runImport(candidates, dryRun)
  if (!dryRun && report.created.length) {
    const userId = (c.get("jwtPayload") as { sub: string } | undefined)?.sub
    logAuditEvent({
      ...(userId && { userId }),
      action: "monitors.imported",
      resourceType: "monitor",
      metadata: { source, created: report.created.length, skipped: report.skipped.length },
    }).catch(() => {})
  }
  return report
}

const isDryRun = (v: string | undefined) => v === "true" || v === "1"

/**
 * Body is either the saved response of `GET /api/v3/checks/` (`{"checks": [...]}`)
 * or `{"apiKey": "...", "baseUrl": "https://..."}` to fetch it from the
 * Healthchecks Management API (baseUrl defaults to healthchecks.io).
 */
importRoute.post("/healthchecks", async (c) => {
  const dryRun = isDryRun(c.req.query("dryRun"))
  const body = await c.req.json().catch(() => null)
  let doc: unknown = body

  if (body && typeof body === "object" && typeof body.apiKey === "string" && body.apiKey) {
    let url: URL
    try {
      url = new URL("/api/v3/checks/", body.baseUrl ?? DEFAULT_HEALTHCHECKS_URL)
    } catch {
      return c.json(bad("baseUrl is not a valid URL"), 400)
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return c.json(bad("baseUrl must be http or https"), 400)
    }
    let res: Response
    try {
      res = await fetch(url, {
        headers: { "X-Api-Key": body.apiKey },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      return c.json({ error: "Could not reach Healthchecks", code: "UPSTREAM_ERROR" }, 502)
    }
    if (!res.ok) {
      return c.json(
        { error: `Healthchecks answered ${res.status}`, code: "UPSTREAM_ERROR" },
        res.status === 401 ? 401 : 502,
      )
    }
    doc = await res.json().catch(() => null)
  }

  const checks = extractHealthchecksChecks(doc)
  if (!checks) {
    return c.json(bad('Send {"checks": [...]} or {"apiKey": "..."}'), 400)
  }
  return c.json({ data: await finish(c, "healthchecks", mapHealthchecks(checks), dryRun) })
})

/** Body is the Uptime Kuma backup JSON (`{"version": ..., "monitorList": [...]}`). */
importRoute.post("/kuma", async (c) => {
  const dryRun = isDryRun(c.req.query("dryRun"))
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== "object" || !Array.isArray(body.monitorList)) {
    return c.json(bad("Send the Uptime Kuma backup JSON (it has a monitorList)"), 400)
  }
  return c.json({ data: await finish(c, "kuma", mapKuma(body.monitorList), dryRun) })
})
