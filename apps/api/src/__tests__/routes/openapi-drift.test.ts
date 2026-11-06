import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guards openapi.ts (hand-written) against drifting from the routes the app
 * really registers. Two sources of truth are compared with the spec:
 *  - `app.routes` from src/app.ts (everything mounted there, including /api/*);
 *  - the `/health*` handlers, which are added in src/index.ts during bootstrap
 *    (not importable without starting the server), read from its source text.
 *
 * To fix a failure: add the missing path+method to openapi.ts, or remove the
 * stale entry from it. Only add to the allowlists below for routes that are
 * intentionally not part of the public API contract, and say why.
 */

/** Registered routes intentionally NOT documented. Format: "METHOD /path". */
const UNDOCUMENTED_ROUTES = new Set<string>([
  // The spec and its viewer do not describe themselves.
  "GET /openapi.json",
  "GET /docs",
])

/** Documented entries intentionally without a registered route. Format: "METHOD /path". */
const DOCUMENTED_WITHOUT_ROUTE = new Set<string>([])

const METHODS = ["get", "post", "put", "patch", "delete"]

const toSpecPath = (p: string) => p.replace(/:([A-Za-z0-9_]+)\??/g, "{$1}").replace(/(.)\/$/, "$1")

async function registeredRoutes(): Promise<Set<string>> {
  const { app } = await import("../../app")
  const found = new Set<string>()
  for (const r of app.routes) {
    const method = r.method.toUpperCase()
    // Middleware (`use`) is registered as ALL and/or with wildcard paths.
    if (method === "ALL" || r.path.includes("*")) continue
    found.add(`${method} ${toSpecPath(r.path)}`)
  }
  const index = readFileSync(resolve(import.meta.dirname, "../../index.ts"), "utf8")
  for (const m of index.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*"(\/[^"]*)"/g)) {
    found.add(`${m[1]?.toUpperCase()} ${toSpecPath(m[2] as string)}`)
  }
  return found
}

async function documentedRoutes(): Promise<Set<string>> {
  const { Hono } = await import("hono")
  const { registerOpenApi } = await import("../../openapi")
  const host = new Hono()
  registerOpenApi(host)
  const spec = (await (await host.request("/openapi.json")).json()) as {
    paths: Record<string, Record<string, unknown>>
  }
  const found = new Set<string>()
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of Object.keys(item)) {
      if (METHODS.includes(method)) found.add(`${method.toUpperCase()} ${path}`)
    }
  }
  return found
}

describe("OpenAPI spec vs registered routes", () => {
  it("documents every registered route", async () => {
    const [routes, documented] = await Promise.all([registeredRoutes(), documentedRoutes()])
    const missing = [...routes]
      .filter((r) => !documented.has(r) && !UNDOCUMENTED_ROUTES.has(r))
      .sort()
    expect(
      missing,
      `Registered but missing from apps/api/src/openapi.ts (add them under "paths", or allowlist with a reason in openapi-drift.test.ts):\n  ${missing.join("\n  ")}`,
    ).toEqual([])
  })

  it("does not document routes that do not exist", async () => {
    const [routes, documented] = await Promise.all([registeredRoutes(), documentedRoutes()])
    const stale = [...documented]
      .filter((r) => !routes.has(r) && !DOCUMENTED_WITHOUT_ROUTE.has(r))
      .sort()
    expect(
      stale,
      `Documented in apps/api/src/openapi.ts but no such route is registered (fix the path/method or remove the entry):\n  ${stale.join("\n  ")}`,
    ).toEqual([])
  })

  it("keeps the allowlists free of stale entries", async () => {
    const [routes, documented] = await Promise.all([registeredRoutes(), documentedRoutes()])
    const stale = [
      ...[...UNDOCUMENTED_ROUTES].filter((r) => !routes.has(r) || documented.has(r)),
      ...[...DOCUMENTED_WITHOUT_ROUTE].filter((r) => routes.has(r) || !documented.has(r)),
    ]
    expect(stale, "Remove these from the allowlists in openapi-drift.test.ts").toEqual([])
  })
})
