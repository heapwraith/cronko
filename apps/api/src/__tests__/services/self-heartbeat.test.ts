import { describe, expect, it, vi } from "vitest"
import { sendSelfHeartbeat } from "../../services/self-heartbeat"

const NOW = 1_000_000_000
const base = { url: "https://hc.example/ping/abc", now: () => NOW, dbUp: () => true }

describe("sendSelfHeartbeat", () => {
  it("pings while the scheduler is ticking", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }))
    const r = await sendSelfHeartbeat({ ...base, lastTickAt: () => NOW - 5_000, fetchFn })
    expect(r).toBe("sent")
    expect(fetchFn).toHaveBeenCalledWith(base.url, expect.objectContaining({ method: "GET" }))
  })

  it("stays silent when the scheduler is stuck, so the external monitor fires", async () => {
    const fetchFn = vi.fn()
    const r = await sendSelfHeartbeat({ ...base, lastTickAt: () => NOW - 10 * 60_000, fetchFn })
    expect(r).toBe("skipped")
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("stays silent before the first scheduler tick", async () => {
    const fetchFn = vi.fn()
    expect(await sendSelfHeartbeat({ ...base, lastTickAt: () => 0, fetchFn })).toBe("skipped")
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("stays silent when the database is down", async () => {
    const fetchFn = vi.fn()
    const r = await sendSelfHeartbeat({
      ...base,
      dbUp: () => false,
      lastTickAt: () => NOW,
      fetchFn,
    })
    expect(r).toBe("skipped")
  })

  it("reports a failed delivery without throwing", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("no", { status: 500 }))
    expect(await sendSelfHeartbeat({ ...base, lastTickAt: () => NOW, fetchFn })).toBe("failed")
    const boom = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    expect(await sendSelfHeartbeat({ ...base, lastTickAt: () => NOW, fetchFn: boom })).toBe(
      "failed",
    )
  })
})
