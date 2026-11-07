import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import { renderApp } from "@/test/render"
import MonitorsPage from "./Monitors"

const monitor = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  status: "healthy",
  expectedIntervalSeconds: 3600,
  gracePeriodSeconds: 60,
  paused: false,
  token: `tok-${id}`,
  scheduleCron: null,
  timezone: null,
  mutedUntil: null,
  tags: [] as string[],
  nextExpectedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  latestHeartbeat: null,
  ...over,
})

const ROWS = [
  monitor("1", "Nightly backup", { tags: ["prod"] }),
  monitor("2", "ETL orders", { tags: ["prod", "etl"] }),
  monitor("3", "Cleanup temp"),
]

const open = () => {
  vi.spyOn(api.monitors, "list").mockResolvedValue(ROWS)
  vi.spyOn(api.maintenance, "list").mockResolvedValue([])
  renderApp(
    <MemoryRouter>
      <MonitorsPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe("MonitorsPage search and bulk actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  const row = (name: string) => screen.getByRole("checkbox", { name: `Selecionar ${name}` })

  it("searches by name, slug and tag", async () => {
    const user = open()
    await screen.findByText("Nightly backup")
    const search = screen.getByRole("searchbox")
    await user.type(search, "etl")
    expect(screen.getByText("ETL orders")).toBeInTheDocument()
    expect(screen.queryByText("Cleanup temp")).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, "cleanup-temp")
    expect(screen.getByText("Cleanup temp")).toBeInTheDocument()
    expect(screen.queryByText("ETL orders")).not.toBeInTheDocument()
  })

  it("shows the bar only while something is selected", async () => {
    const user = open()
    await screen.findByText("Nightly backup")
    expect(screen.queryByRole("region", { name: "Ações em lote" })).not.toBeInTheDocument()
    await user.click(row("Nightly backup"))
    const bar = screen.getByRole("region", { name: "Ações em lote" })
    expect(within(bar).getByText("1 selecionado(s)")).toBeInTheDocument()
    await user.click(row("Nightly backup"))
    expect(screen.queryByRole("region", { name: "Ações em lote" })).not.toBeInTheDocument()
  })

  it("select-all picks only the monitors that match the search", async () => {
    const user = open()
    await screen.findByText("Nightly backup")
    await user.type(screen.getByRole("searchbox"), "prod")
    await user.click(
      screen.getByRole("checkbox", { name: "Selecionar todos os monitores listados" }),
    )
    expect(
      within(screen.getByRole("region", { name: "Ações em lote" })).getByText("2 selecionado(s)"),
    ).toBeInTheDocument()
    const bulk = vi.spyOn(api.monitors, "bulk").mockResolvedValue({ succeeded: 2, failed: [] })
    await user.click(screen.getByRole("button", { name: "Pausar" }))
    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1))
    // The list is sorted by severity then name, so compare the ids as a set.
    const sent = bulk.mock.calls[0]?.[0]
    expect(sent?.action).toBe("pause")
    expect([...(sent?.ids ?? [])].sort()).toEqual(["1", "2"])
  })

  it("keeps the failed monitors selected after a partial result", async () => {
    const user = open()
    await screen.findByText("Nightly backup")
    await user.click(row("Nightly backup"))
    await user.click(row("ETL orders"))
    vi.spyOn(api.monitors, "bulk").mockResolvedValue({
      succeeded: 1,
      failed: [{ id: "2", reason: "error" }],
    })
    await user.click(screen.getByRole("button", { name: "Retomar" }))
    expect(await screen.findByText("1 ok, 1 com falha")).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "Ações em lote" })).getByText("1 selecionado(s)"),
      ).toBeInTheDocument(),
    )
    expect(row("ETL orders")).toBeChecked()
    expect(row("Nightly backup")).not.toBeChecked()
  })

  it("adds a tag only when one is typed, and sends it as typed", async () => {
    const user = open()
    await screen.findByText("Nightly backup")
    await user.click(row("Cleanup temp"))
    const add = screen.getByRole("button", { name: "Adicionar tag" })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText("Tag"), " Produção ")
    const bulk = vi.spyOn(api.monitors, "bulk").mockResolvedValue({ succeeded: 1, failed: [] })
    await user.click(add)
    await waitFor(() =>
      expect(bulk).toHaveBeenCalledWith({ ids: ["3"], action: "addTag", tag: "Produção" }),
    )
  })

  it("asks before deleting and does nothing on cancel", async () => {
    const user = open()
    await screen.findByText("Nightly backup")
    await user.click(row("Cleanup temp"))
    const bulk = vi.spyOn(api.monitors, "bulk").mockResolvedValue({ succeeded: 1, failed: [] })
    const bar = screen.getByRole("region", { name: "Ações em lote" })
    await user.click(within(bar).getByRole("button", { name: "Excluir" }))
    expect(bulk).not.toHaveBeenCalled()
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }))
    expect(bulk).not.toHaveBeenCalled()

    await user.click(within(bar).getByRole("button", { name: "Excluir" }))
    const again = await screen.findByRole("dialog")
    await user.click(within(again).getByRole("button", { name: "Excluir" }))
    await waitFor(() => expect(bulk).toHaveBeenCalledWith({ ids: ["3"], action: "delete" }))
  })
})
