import { describe, expect, it } from "vitest"
import { buildDigest, type DigestInput, digestDue, lastDigestSlot } from "../digest"

const at = (iso: string) => new Date(iso)
const SP = "America/Sao_Paulo" // UTC-3, so 09:00 local = 12:00 UTC

describe("lastDigestSlot / digestDue", () => {
  it("finds today's slot after the hour and yesterday's before it", () => {
    expect(lastDigestSlot("daily", 9, SP, at("2026-11-06T12:30:00Z"))?.toISOString()).toBe(
      "2026-11-06T12:00:00.000Z",
    )
    expect(lastDigestSlot("daily", 9, SP, at("2026-11-06T11:59:00Z"))?.toISOString()).toBe(
      "2026-11-05T12:00:00.000Z",
    )
  })

  it("weekly goes out on Mondays", () => {
    // 2026-11-06 is a Friday; the previous Monday is 2026-11-02.
    expect(lastDigestSlot("weekly", 9, SP, at("2026-11-06T15:00:00Z"))?.toISOString()).toBe(
      "2026-11-02T12:00:00.000Z",
    )
  })

  it("is due once per slot", () => {
    const base = { frequency: "daily" as const, hour: 9, timezone: SP }
    const now = at("2026-11-06T12:00:30Z")
    const slot = digestDue({ ...base, now, lastSentAt: at("2026-11-05T12:00:05Z") })
    expect(slot?.toISOString()).toBe("2026-11-06T12:00:00.000Z")
    expect(digestDue({ ...base, now, lastSentAt: at("2026-11-06T12:00:10Z") })).toBeNull()
  })

  it("does not send a backlog after a long downtime: only the latest slot", () => {
    const slot = digestDue({
      frequency: "daily",
      hour: 9,
      timezone: SP,
      now: at("2026-11-06T13:00:00Z"),
      lastSentAt: at("2026-11-01T12:00:00Z"),
    })
    expect(slot?.toISOString()).toBe("2026-11-06T12:00:00.000Z")
  })

  it("never fires when off", () => {
    expect(
      digestDue({ frequency: "off", hour: 9, timezone: SP, now: new Date(), lastSentAt: null }),
    ).toBeNull()
  })
})

describe("buildDigest", () => {
  const from = at("2026-11-05T12:00:00Z")
  const to = at("2026-11-06T12:00:00Z")
  const mon = (id: string, status = "healthy", over = {}) => ({
    id,
    name: id,
    status,
    paused: false,
    expectedIntervalSeconds: 3600,
    ...over,
  })
  const base: DigestInput = {
    frequency: "daily",
    from,
    to,
    timezone: SP,
    instanceName: "Acme",
    monitors: [],
    incidents: [],
    runs: [],
  }

  it("summarises state, failures and incidents", () => {
    const text = buildDigest({
      ...base,
      monitors: [mon("etl"), mon("backup", "down"), mon("old", "paused", { paused: true })],
      incidents: [
        { monitorId: "backup", startedAt: at("2026-11-06T09:00:00Z"), resolvedAt: null },
        {
          monitorId: "etl",
          startedAt: at("2026-11-05T20:00:00Z"),
          resolvedAt: at("2026-11-05T21:00:00Z"),
        },
      ],
      runs: [
        { monitorId: "etl", exitCode: 0, kind: null },
        { monitorId: "etl", exitCode: 2, kind: "finish" },
        { monitorId: "etl", exitCode: null, kind: "start" },
        { monitorId: "backup", exitCode: 1, kind: null },
      ],
      link: "https://cronko.example/",
    })
    expect(text).toContain("Resumo diário — Acme (5 de nov)")
    expect(text).toContain("Agora: 3 monitores — 1 ok, 1 com problema, 1 pausado")
    expect(text).toContain("Precisam de atenção: backup (down há 3 h)")
    expect(text).toContain("• 3 execuções, 2 com falha")
    expect(text).toContain("Falhas: backup (1), etl (1)")
    expect(text).toContain("• 2 incidentes em 2 monitores")
    expect(text.endsWith("https://cronko.example/")).toBe(true)
  })

  it("says so when the period was quiet", () => {
    const text = buildDigest({
      ...base,
      monitors: [mon("etl")],
      runs: [{ monitorId: "etl", exitCode: 0, kind: null }],
    })
    expect(text).toContain("• 1 execução, nenhuma falha")
    expect(text).toContain("Nenhum incidente novo")
    expect(text).not.toContain("Precisam de atenção")
    expect(text).not.toContain("Sem nenhum ping")
  })

  it("flags silent jobs only when they were expected to run in the period", () => {
    const text = buildDigest({
      ...base,
      monitors: [mon("hourly"), mon("weekly", "healthy", { expectedIntervalSeconds: 604_800 })],
    })
    expect(text).toContain("Sem nenhum ping: hourly")
    expect(text).not.toContain("weekly")
  })

  it("caps long name lists", () => {
    const monitors = Array.from({ length: 8 }, (_, i) => mon(`m${i}`, "down"))
    const text = buildDigest({ ...base, monitors })
    expect(text).toMatch(/Precisam de atenção: m0 \(down\), .* \+3/)
  })

  it("labels a weekly digest with its date range", () => {
    const text = buildDigest({
      ...base,
      frequency: "weekly",
      from: at("2026-10-26T12:00:00Z"),
      to: at("2026-11-02T12:00:00Z"),
    })
    expect(text).toContain("Resumo semanal — Acme (26 de out a 2 de nov)")
  })
})
