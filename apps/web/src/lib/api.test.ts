import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, api } from "./api"

const res = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status })

describe("api client", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("unwraps the data envelope and sends same-origin credentials", async () => {
    fetchMock.mockResolvedValueOnce(res({ data: [{ id: "m1" }] }))
    await expect(api.monitors.list()).resolves.toEqual([{ id: "m1" }])
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/monitors",
      expect.objectContaining({ credentials: "same-origin" }),
    )
  })

  it("throws ApiError carrying status and parsed body", async () => {
    fetchMock.mockResolvedValueOnce(res({ error: { message: "nope" } }, 404))
    const err = await api.monitors.get("x").catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 404,
      message: "API 404",
      body: { error: { message: "nope" } },
    })
  })

  it("falls back to a null body when the error is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502 }))
    const err = await api.stats.get().catch((e) => e)
    expect(err).toMatchObject({ status: 502, body: null })
  })

  it("posts JSON bodies and surfaces errors for post, patch and delete", async () => {
    fetchMock.mockResolvedValueOnce(res({ data: { id: "1", name: "a" } }))
    await api.notifications.create({ name: "a", type: "webhook", config: {} })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(init.method).toBe("POST")
    expect(init.headers["Content-Type"]).toBe("application/json")
    expect(JSON.parse(init.body)).toEqual({ name: "a", type: "webhook", config: {} })

    fetchMock.mockResolvedValueOnce(res({ error: 1 }, 400))
    await expect(api.monitors.update("1", { name: "b" })).rejects.toMatchObject({ status: 400 })
    expect(fetchMock.mock.calls[1]?.[1].method).toBe("PATCH")

    fetchMock.mockResolvedValueOnce(res(undefined, 500))
    await expect(api.monitors.delete("1")).rejects.toMatchObject({ status: 500, body: null })
    expect(fetchMock.mock.calls[2]?.[1].method).toBe("DELETE")
  })

  it("refreshes and retries for non-auth paths", async () => {
    fetchMock
      .mockResolvedValueOnce(res({}, 401))
      .mockResolvedValueOnce(res({}, 200)) // /auth/refresh
      .mockResolvedValueOnce(res({ data: { healthyCount: 1 } }))
    await expect(api.stats.get()).resolves.toEqual({ healthyCount: 1 })
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/stats",
      "/auth/refresh",
      "/api/stats",
    ])
  })

  it("shares one refresh between concurrent 401s", async () => {
    fetchMock.mockImplementation(async (path: string) => {
      if (path === "/auth/refresh") return res({}, 200)
      const seen = fetchMock.mock.calls.filter((c) => c[0] === path).length
      return seen <= 1 ? res({}, 401) : res({ data: path })
    })
    await Promise.all([api.stats.get(), api.monitors.list()])
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/auth/refresh")).toHaveLength(1)
  })

  it("does not retry when the refresh fails, or for /auth/ paths", async () => {
    fetchMock.mockResolvedValueOnce(res({}, 401)).mockResolvedValueOnce(res({}, 401))
    await expect(api.stats.get()).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(res({}, 401))
    await expect(api.auth.login({ email: "a", password: "b" })).rejects.toMatchObject({
      status: 401,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("treats a network failure during refresh as not refreshed", async () => {
    fetchMock.mockResolvedValueOnce(res({}, 401)).mockRejectedValueOnce(new Error("offline"))
    await expect(api.stats.get()).rejects.toMatchObject({ status: 401 })
  })

  it("builds query strings", async () => {
    fetchMock.mockImplementation(async () => res({ data: [] }))
    await api.monitors.heartbeats("m", { limit: 5, before: "2026-01-01" })
    await api.incidents.list({ status: "open", limit: 10, offset: 20 })
    await api.monitors.incidents("m")
    await api.notifications.deliveries()
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/monitors/m/heartbeats?limit=5&before=2026-01-01",
      "/api/incidents?status=open&limit=10&offset=20",
      "/api/monitors/m/incidents",
      "/api/notifications/deliveries?limit=50",
    ])
  })
})
