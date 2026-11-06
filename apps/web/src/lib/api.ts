import type { DurationStats } from "@cronko/shared/run-stats"
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

let refreshPromise: Promise<boolean> | null = null

/** Refresh the session once, even if several requests hit a 401 together. */
function refreshSession(): Promise<boolean> {
  refreshPromise ??= fetch("/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const request = () => fetch(path, { ...init, credentials: "same-origin" })

  const res = await request()
  if (res.status === 401 && !path.startsWith("/auth/") && (await refreshSession())) {
    return request()
  }
  return res
}

async function get<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) {
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = null
    }
    throw new ApiError(`API ${res.status}`, res.status, body)
  }
  const json = (await res.json()) as { data: T }
  return json.data
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await authFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    let errBody: unknown
    try {
      errBody = await res.json()
    } catch {
      errBody = null
    }
    throw new ApiError(`API ${res.status}`, res.status, errBody)
  }
  const json = (await res.json()) as { data: T }
  return json.data
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await authFetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let errBody: unknown
    try {
      errBody = await res.json()
    } catch {
      errBody = null
    }
    throw new ApiError(`API ${res.status}`, res.status, errBody)
  }
  const json = (await res.json()) as { data: T }
  return json.data
}

async function del<T>(path: string): Promise<T> {
  const res = await authFetch(path, {
    method: "DELETE",
  })
  if (!res.ok) {
    let errBody: unknown
    try {
      errBody = await res.json()
    } catch {
      errBody = null
    }
    throw new ApiError(`API ${res.status}`, res.status, errBody)
  }
  const json = (await res.json()) as { data: T }
  return json.data
}

/** Body for creating a monitor: an interval, or a cron schedule with a timezone. */
export interface MonitorInput {
  name: string
  expectedIntervalSeconds?: number
  /** null switches an existing monitor back to a plain interval (update only). */
  scheduleCron?: string | null
  timezone?: string
  gracePeriodSeconds: number
  maxDurationMs?: number
}

export const api = {
  auth: {
    login: (body: { email: string; password: string }) =>
      post<{ token: string; email: string; expiresAt: string }>("/auth/login", body),
    logout: () => post<{ ok: boolean }>("/auth/logout"),
    me: () => get<{ id: string; email: string }>("/auth/me"),
  },
  stats: {
    get: () =>
      get<{
        healthyCount: number
        downCount: number
        missedCount: number
        failedCount: number
        pausedCount: number
        totalHeartbeats: number
        uptimePercent: number
        heartbeatsByHour: number[]
      }>("/api/stats"),
  },
  monitors: {
    list: () =>
      get<
        Array<{
          id: string
          name: string
          status: string
          expectedIntervalSeconds: number
          gracePeriodSeconds: number
          paused: boolean
          slug: string
          token: string
          scheduleCron: string | null
          timezone: string | null
          mutedUntil: string | null
          nextExpectedAt: string | null
          createdAt: string
          updatedAt: string
          latestHeartbeat: {
            receivedAt: string
            durationMs: number | null
            exitCode: number | null
          } | null
        }>
      >("/api/monitors"),
    get: (id: string) =>
      get<{
        id: string
        name: string
        status: string
        expectedIntervalSeconds: number
        gracePeriodSeconds: number
        maxDurationMs: number | null
        scheduleCron: string | null
        timezone: string | null
        mutedUntil: string | null
        nextExpectedAt: string | null
        paused: boolean
        slug: string
        token: string
        createdAt: string
        updatedAt: string
        recentHeartbeats: Array<{
          id: string
          monitorId: string
          receivedAt: string
          sourceIp: string | null
          userAgent: string | null
          durationMs: number | null
          exitCode: number | null
          body?: string | null
          kind: "start" | "finish" | null
          overlapped: boolean
          unusuallySlow: boolean
        }>
        typical: DurationStats | null
        openIncident: {
          id: string
          monitorId: string
          status: string
          startedAt: string
          resolvedAt: string | null
        } | null
      }>(`/api/monitors/${id}`),
    create: (body: MonitorInput) =>
      post<{
        id: string
        name: string
        status: string
        slug: string
        token: string
      }>("/api/monitors", body),
    update: (id: string, body: Partial<MonitorInput>) =>
      patch<{ id: string; name: string }>(`/api/monitors/${id}`, body),
    delete: (id: string) => del<{ ok: boolean }>(`/api/monitors/${id}`),
    pause: (id: string) => post<{ id: string; status: string }>(`/api/monitors/${id}/pause`),
    resume: (id: string) => post<{ id: string; status: string }>(`/api/monitors/${id}/resume`),
    /** Silence alerts for `minutes`; null unmutes. */
    mute: (id: string, minutes: number | null) =>
      post<{ id: string; mutedUntil: string | null }>(`/api/monitors/${id}/mute`, { minutes }),
    heartbeats: (id: string, query?: { limit?: number; before?: string }) => {
      const params = new URLSearchParams()
      if (query?.limit) params.set("limit", String(query.limit))
      if (query?.before) params.set("before", query.before)
      const qs = params.toString()
      return get<
        Array<{
          id: string
          monitorId: string
          receivedAt: string
          sourceIp: string | null
          userAgent: string | null
          durationMs: number | null
          exitCode: number | null
        }>
      >(`/api/monitors/${id}/heartbeats${qs ? `?${qs}` : ""}`)
    },
    run: (id: string, runId: string) => {
      type R = {
        id: string
        receivedAt: string
        sourceIp: string | null
        userAgent: string | null
        durationMs: number | null
        exitCode: number | null
        body: string | null
        kind: "start" | "finish" | null
        overlapped: boolean
      }
      return get<{
        run: R
        previous: R | null
        previousGood: R | null
        nextId: string | null
        typical: DurationStats | null
        unusuallySlow: boolean
      }>(`/api/monitors/${id}/runs/${runId}`)
    },
    incidents: (id: string, query?: { limit?: number; offset?: number }) => {
      const params = new URLSearchParams()
      if (query?.limit) params.set("limit", String(query.limit))
      if (query?.offset) params.set("offset", String(query.offset))
      const qs = params.toString()
      return get<
        Array<{
          id: string
          monitorId: string
          status: string
          startedAt: string
          resolvedAt: string | null
        }>
      >(`/api/monitors/${id}/incidents${qs ? `?${qs}` : ""}`)
    },
  },
  incidents: {
    list: (query?: { status?: string; limit?: number; offset?: number }) => {
      const params = new URLSearchParams()
      if (query?.status) params.set("status", query.status)
      if (query?.limit) params.set("limit", String(query.limit))
      if (query?.offset) params.set("offset", String(query.offset))
      const qs = params.toString()
      return get<
        Array<{
          id: string
          monitorId: string
          status: string
          startedAt: string
          resolvedAt: string | null
        }>
      >(`/api/incidents${qs ? `?${qs}` : ""}`)
    },
  },
  notifications: {
    list: () =>
      get<
        Array<{
          id: string
          name: string
          type: string
          enabled: boolean
          config: Record<string, unknown>
          createdAt: string
        }>
      >("/api/notifications"),
    deliveries: (limit = 50) =>
      get<
        Array<{
          id: string
          channelId: string
          channelName: string
          monitorName: string
          event: string
          status: "pending" | "sent" | "failed"
          attempts: number
          lastError: string | null
          createdAt: string
        }>
      >(`/api/notifications/deliveries?limit=${limit}`),
    create: (body: { name: string; type: string; config: unknown }) =>
      post<{ id: string; name: string }>("/api/notifications", body),
    delete: (id: string) => del<{ ok: boolean }>(`/api/notifications/${id}`),
    test: (id: string) => post<{ ok: boolean }>(`/api/notifications/${id}/test`),
    update: (
      id: string,
      body: {
        name?: string
        enabled?: boolean
        config?: Record<string, unknown>
      },
    ) =>
      patch<{
        id: string
        name: string
        type: string
        enabled: boolean
        config: Record<string, unknown>
      }>(`/api/notifications/${id}`, body),
  },
  settings: {
    get: () =>
      get<{
        instanceName: string
        timezone: string
        schedulerTickMs: number
        defaultGracePeriodSeconds: number
        defaultIntervalSeconds: number
        pingRateLimitPerMinute: number
        maxHeartbeatsPerMonitor: number
        heartbeatHistoryDays: number
      }>("/api/settings"),
    update: (body: {
      instanceName?: string
      timezone?: string
      schedulerTickMs?: number
      defaultGracePeriodSeconds?: number
      defaultIntervalSeconds?: number
      pingRateLimitPerMinute?: number
      maxHeartbeatsPerMonitor?: number
      heartbeatHistoryDays?: number
    }) =>
      post<{
        instanceName: string
        timezone: string
        schedulerTickMs: number
        defaultGracePeriodSeconds: number
        defaultIntervalSeconds: number
        pingRateLimitPerMinute: number
        maxHeartbeatsPerMonitor: number
        heartbeatHistoryDays: number
      }>("/api/settings", body),
  },
}
