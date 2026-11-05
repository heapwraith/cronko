const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

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

let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
    return res.ok
  } catch {
    return false
  }
}

async function handleRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = refreshToken().finally(() => {
    isRefreshing = false
    refreshPromise = null
  })

  return refreshPromise
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
  }

  // Read auth + CSRF cookies server-side (SSR)
  if (typeof window === "undefined") {
    try {
      const { cookies } = await import("next/headers")
      const cookieStore = await cookies()
      const token = cookieStore.get("cronko_token")?.value
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }
      // Also read CSRF token server-side for SSR mutations
      const csrfToken = cookieStore.get("csrf_token")?.value
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken
      }
    } catch {
      // cookies() not available in client context
    }
  }

  // Read CSRF token client-side (browser)
  if (!headers["x-csrf-token"]) {
    const method = (init.method ?? "GET").toUpperCase()
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      if (typeof document !== "undefined") {
        const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)
        const csrfToken = match?.[1]
        if (csrfToken) {
          headers["x-csrf-token"] = csrfToken
        }
      }
    }
  }

  let res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  })

  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await handleRefresh()
    if (refreshed) {
      if (typeof window === "undefined") {
        try {
          const { cookies } = await import("next/headers")
          const cookieStore = await cookies()
          const newToken = cookieStore.get("cronko_token")?.value
          if (newToken) {
            headers["Authorization"] = `Bearer ${newToken}`
          }
        } catch {
          // cookies() not available in client context
        }
      }

      res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        credentials: "include",
        headers,
      })
    }
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
          createdAt: string
          updatedAt: string
          latestHeartbeat: {
            receivedAt: string
            durationMs: number | null
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
        }>
        openIncident: {
          id: string
          monitorId: string
          status: string
          startedAt: string
          resolvedAt: string | null
        } | null
      }>(`/api/monitors/${id}`),
    create: (body: { name: string; expectedIntervalSeconds: number; gracePeriodSeconds: number }) =>
      post<{
        id: string
        name: string
        status: string
        slug: string
        token: string
      }>("/api/monitors", body),
    update: (
      id: string,
      body: {
        name?: string
        expectedIntervalSeconds?: number
        gracePeriodSeconds?: number
      },
    ) => patch<{ id: string; name: string }>(`/api/monitors/${id}`, body),
    delete: (id: string) => del<{ ok: boolean }>(`/api/monitors/${id}`),
    pause: (id: string) => post<{ id: string; status: string }>(`/api/monitors/${id}/pause`),
    resume: (id: string) => post<{ id: string; status: string }>(`/api/monitors/${id}/resume`),
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
