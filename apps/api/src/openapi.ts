import { Scalar } from "@scalar/hono-api-reference"

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Cronko",
    version: "0.3.0",
    description: "Heartbeat monitoring for cron jobs, scripts, and ETLs.",
  },
  servers: [{ url: "http://localhost:3001", description: "Local development" }],
  paths: {
    "/health": {
      get: {
        summary: "Health check with uptime",
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" }, uptime: { type: "number" } },
                },
              },
            },
          },
        },
      },
    },
    "/health/live": {
      get: {
        summary: "Liveness probe",
        responses: { "200": { description: "alive" } },
      },
    },
    "/health/ready": {
      get: {
        summary: "Readiness probe — database connectivity",
        responses: { "200": { description: "ready" }, "503": { description: "database down" } },
      },
    },
    "/health/metrics": {
      get: {
        summary: "Scheduler metrics",
        responses: { "200": { description: "uptime, scheduler stats, memory" } },
      },
    },
    "/ping/{token}": {
      get: {
        summary: "Send a heartbeat (GET)",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" } },
          { name: "d", in: "query", schema: { type: "integer", description: "Duration in ms" } },
          { name: "exit", in: "query", schema: { type: "integer", description: "Exit code" } },
        ],
        responses: {
          "200": { description: "ok" },
          "404": { description: "Monitor not found" },
          "429": { description: "Rate limited" },
        },
      },
      post: {
        summary: "Send a heartbeat with body (POST)",
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  body: { type: "string", maxLength: 10000 },
                  log: { type: "string" },
                  text: { type: "string" },
                },
              },
            },
            "text/plain": { schema: { type: "string", maxLength: 10000 } },
          },
        },
        responses: {
          "200": { description: "ok" },
          "404": { description: "Monitor not found" },
          "413": { description: "Body too large" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/ping/{token}/start": {
      post: {
        summary: "Pulse start — begin a long-running job (GET is also accepted)",
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "ok" }, "404": { description: "Monitor not found" } },
      },
    },
    "/ping/{token}/fail": {
      post: {
        summary: "Report that the job ran and failed (alerts immediately)",
        description:
          "Marks the monitor `failed`, opens an incident and alerts. `exit` (query) is the exit code, default 1. The request body (up to 10 KB) is stored as job output. A later successful ping recovers it. GET is also accepted.",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" } },
          { name: "exit", in: "query", required: false, schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "ok" },
          "404": { description: "Monitor not found" },
          "413": { description: "Body too large" },
        },
      },
    },
    "/ping/{token}/finish": {
      post: {
        summary: "Pulse finish — complete a long-running job with duration",
        description:
          "Closes the open `/start`. Without `d`, the duration is the time since that `/start`. With no open `/start`, it is stored as a plain run. GET is also accepted.",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" } },
          {
            name: "d",
            in: "query",
            schema: { type: "integer", description: "Duration in ms (optional)" },
          },
          { name: "exit", in: "query", schema: { type: "integer", description: "Exit code" } },
        ],
        responses: { "200": { description: "ok" }, "404": { description: "Monitor not found" } },
      },
    },
    "/badge/{token}": {
      get: {
        summary: "Public SVG status badge",
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "SVG badge", content: { "image/svg+xml": {} } },
          "404": { description: "Monitor not found" },
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Login with email and password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 1 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "token + email + expiresAt" },
          "401": { description: "Invalid credentials" },
          "429": { description: "Too many login attempts" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Refresh access token using the refresh cookie",
        responses: {
          "200": { description: "new access token" },
          "401": { description: "Invalid or expired refresh token" },
        },
      },
    },
    "/auth/logout": {
      post: {
        summary: "Logout — clear all auth cookies",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/auth/me": {
      get: {
        summary: "Get current user info",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "user id and email" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/monitors": {
      get: {
        summary: "List all monitors",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [
          {
            name: "tag",
            in: "query",
            schema: { type: "string" },
            description: "Only monitors carrying this tag (case-insensitive)",
          },
        ],
        responses: { "200": { description: "Array of monitors with latest heartbeat" } },
      },
      post: {
        summary: "Create a monitor",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "Give expectedIntervalSeconds or scheduleCron (with timezone).",
                required: ["name"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 100 },
                  expectedIntervalSeconds: { type: "integer", minimum: 10, maximum: 31536000 },
                  scheduleCron: {
                    type: "string",
                    description: "5-field cron expression or @nickname",
                  },
                  timezone: { type: "string", description: "IANA timezone for scheduleCron" },
                  gracePeriodSeconds: { type: "integer", default: 120 },
                  maxDurationMs: { type: "integer" },
                  tags: { type: "array", items: { type: "string" }, maxItems: 10 },
                  alertOnAnomalies: { type: "boolean", default: false },
                  emailFailureKeywords: {
                    type: "array",
                    items: { type: "string", maxLength: 40 },
                    maxItems: 10,
                    description: "Ping by e-mail: subject words that mark a failure",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Monitor created" },
          "409": { description: "Name already exists" },
        },
      },
    },
    "/api/monitors/{id}": {
      get: {
        summary: "Get a single monitor with recent heartbeats",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Monitor details" },
          "404": { description: "Not found" },
        },
      },
      patch: {
        summary: "Update a monitor (same fields as create, all optional)",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Monitor updated" } },
      },
      delete: {
        summary: "Delete a monitor",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/api/monitors/{id}/pause": {
      post: {
        summary: "Pause a monitor",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Monitor paused" } },
      },
    },
    "/api/monitors/{id}/resume": {
      post: {
        summary: "Resume a monitor",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Monitor resumed" } },
      },
    },
    "/api/monitors/{id}/incidents": {
      get: {
        summary: "Get incidents for a monitor",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "Array of incidents" } },
      },
    },
    "/api/status-pages": {
      get: {
        summary: "List status pages",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Array of status pages" } },
      },
      post: {
        summary: "Create a status page (disabled unless enabled: true)",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["slug", "title", "tag"],
                properties: {
                  slug: { type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$" },
                  title: { type: "string", maxLength: 80 },
                  description: { type: ["string", "null"], maxLength: 280 },
                  tag: { type: "string" },
                  enabled: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "409": { description: "Slug in use" } },
      },
    },
    "/api/status-pages/{id}": {
      patch: {
        summary: "Update a status page",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" }, "404": { description: "Not found" } },
      },
      delete: {
        summary: "Delete a status page",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "404": { description: "Not found" } },
      },
    },
    "/public/status/{slug}": {
      get: {
        summary: "Public status data (no authentication; enabled pages only)",
        description:
          "Title, description, overall state, each tagged monitor's name, public state and 90 days of daily availability, and incidents of the last 30 days. Never tokens, ping URLs, ids, output or IPs. Missing and disabled pages both return 404.",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Public status" }, "404": { description: "Not found" } },
      },
    },
    "/api/monitors/{id}/mute": {
      post: {
        summary: "Silence alerts for N minutes (max 30 days); minutes: null unmutes",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["minutes"],
                properties: { minutes: { type: ["integer", "null"], minimum: 1, maximum: 43200 } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated monitor" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/import/healthchecks": {
      post: {
        summary: "Import monitors from Healthchecks (saved API response or live Management API)",
        description:
          'Body: the saved response of GET /api/v3/checks/ ({"checks": [...]}), or {"apiKey", "baseUrl"?} to fetch it (baseUrl defaults to https://healthchecks.io). Names that already exist are skipped. Returns what was created and skipped, with warnings for fields that have no equivalent.',
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [
          {
            name: "dryRun",
            in: "query",
            schema: { type: "boolean" },
            description: "Report what would happen without creating anything",
          },
        ],
        responses: {
          "200": { description: "{ dryRun, created[], skipped[] }" },
          "400": { description: "Unrecognised body" },
          "401": { description: "Healthchecks rejected the API key" },
          "502": { description: "Healthchecks unreachable or failed" },
        },
      },
    },
    "/api/import/kuma": {
      post: {
        summary: "Import push monitors from an Uptime Kuma backup JSON",
        description:
          "Body: the backup file ({version, monitorList}). Only push monitors are imported; other types are reported as skipped. Names that already exist are skipped.",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [
          {
            name: "dryRun",
            in: "query",
            schema: { type: "boolean" },
            description: "Report what would happen without creating anything",
          },
        ],
        responses: {
          "200": { description: "{ dryRun, created[], skipped[] }" },
          "400": { description: "Not a Kuma backup" },
        },
      },
    },
    "/api/monitors/{id}/runs/{runId}": {
      get: {
        summary: "Get one run with the previous run and the last successful run before it",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "runId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "{ run, previous, previousGood, nextId }" },
          "404": { description: "Run not found" },
        },
      },
    },
    "/api/monitors/{id}/heartbeats": {
      get: {
        summary: "Get heartbeats for a monitor",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 500 } },
          {
            name: "before",
            in: "query",
            schema: { type: "string", description: "Cursor for pagination" },
          },
          { name: "format", in: "query", schema: { type: "string", enum: ["csv"] } },
        ],
        responses: { "200": { description: "Array of heartbeats or CSV text" } },
      },
    },
    "/api/monitors/reorder": {
      post: {
        summary: "Reorder monitors",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["ids"],
                properties: { ids: { type: "array", items: { type: "string" } } },
              },
            },
          },
        },
        responses: { "200": { description: "ok" } },
      },
    },
    "/api/incidents": {
      get: {
        summary: "List incidents",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["open", "resolved"] } },
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "offset", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Array of incidents" } },
      },
    },
    "/api/notifications": {
      get: {
        summary: "List notification channels",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Array of notification channels" } },
      },
      post: {
        summary: "Create a notification channel",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        responses: { "201": { description: "Channel created" } },
      },
    },
    "/api/notifications/{id}": {
      patch: {
        summary: "Update a notification channel",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Channel updated" } },
      },
      delete: {
        summary: "Delete a notification channel",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/api/notifications/{id}/test": {
      post: {
        summary: "Send a test notification",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/api/stats": {
      get: {
        summary: "Get dashboard statistics",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Stats object" } },
      },
    },
    "/api/settings": {
      get: {
        summary: "Get current settings",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Settings object" } },
      },
      post: {
        summary: "Update settings (includes digestFrequency off|daily|weekly and digestHour)",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        responses: { "200": { description: "Settings updated" } },
      },
    },
    "/api/settings/digest/test": {
      post: {
        summary: "Queue a digest for the last period on every enabled channel",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        responses: {
          "200": { description: "Number of deliveries queued" },
          "400": { description: "No enabled notification channel" },
        },
      },
    },
    "/api/maintenance-windows": {
      get: {
        summary: "List maintenance windows, with whether each is running now",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Array of windows" } },
      },
      post: {
        summary: "Create a recurring maintenance window",
        description:
          "Body: name, schedule (cron start), timezone, durationMinutes (up to 7 days), target (all | tag | monitor), targetValue, enabled.",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        responses: { "201": { description: "Created" }, "400": { description: "Invalid" } },
      },
    },
    "/api/maintenance-windows/{id}": {
      patch: {
        summary: "Update a maintenance window",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Updated" }, "404": { description: "Not found" } },
      },
      delete: {
        summary: "Delete a maintenance window",
        security: [{ bearerAuth: [] }, { csrf: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "404": { description: "Not found" } },
      },
    },
    "/api/notifications/deliveries": {
      get: {
        summary: "Delivery log: recent alert deliveries with status, attempts and last error",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Array of deliveries" } },
      },
    },
    "/api/audit": {
      get: {
        summary: "List audit log entries",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          {
            name: "before",
            in: "query",
            schema: { type: "string", description: "Cursor for pagination" },
          },
        ],
        responses: { "200": { description: "Array of audit entries" } },
      },
    },
  },
}

export function registerOpenApi(app: { get: (path: string, ...args: unknown[]) => void }) {
  app.get("/openapi.json", (c: { json: (body: unknown) => Response }) => c.json(spec))

  app.get(
    "/docs",
    Scalar({
      spec: { url: "/openapi.json" },
      pageTitle: "Cronko",
    }),
  )
}
