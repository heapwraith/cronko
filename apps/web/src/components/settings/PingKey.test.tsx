import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import { renderApp } from "@/test/render"
import { PingKey } from "./PingKey"

const KEY = "pk_AbCdEfGhIjKlMnOpQrStUvWxYz012345"

describe("PingKey", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("offers to generate a key when there is none, without confirmation", async () => {
    const user = userEvent.setup()
    const get = vi.spyOn(api.settings.pingKey, "get").mockResolvedValue({ key: null })
    const rotate = vi.spyOn(api.settings.pingKey, "rotate").mockResolvedValue({ key: KEY })
    renderApp(<PingKey />)

    expect(
      await screen.findByText("Ainda não há chave. Gere uma para usar os pings por slug."),
    ).toBeInTheDocument()
    get.mockResolvedValue({ key: KEY })
    await user.click(screen.getByRole("button", { name: "Gerar chave" }))
    await waitFor(() => expect(rotate).toHaveBeenCalledTimes(1))
  })

  it("keeps the key masked until shown, and shows slug examples", async () => {
    const user = userEvent.setup()
    vi.spyOn(api.settings.pingKey, "get").mockResolvedValue({ key: KEY })
    renderApp(<PingKey />)

    const code = await screen.findByTestId("ping-key")
    expect(code.textContent).not.toContain(KEY)
    expect(code.textContent?.startsWith("pk_AbC")).toBe(true)
    await user.click(screen.getByRole("button", { name: "Mostrar" }))
    expect(screen.getByTestId("ping-key").textContent).toBe(KEY)
    expect(screen.getByText(/ping\/k\/pk_AbCd.*\/<slug>\?create=1/)).toBeInTheDocument()
  })

  it("asks before rotating an existing key, and does nothing on cancel", async () => {
    const user = userEvent.setup()
    vi.spyOn(api.settings.pingKey, "get").mockResolvedValue({ key: KEY })
    const rotate = vi.spyOn(api.settings.pingKey, "rotate").mockResolvedValue({ key: `${KEY}x` })
    renderApp(<PingKey />)

    await user.click(await screen.findByRole("button", { name: "Trocar chave" }))
    expect(rotate).not.toHaveBeenCalled()
    await user.click(await screen.findByRole("button", { name: "Cancelar" }))
    expect(rotate).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Trocar chave" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Trocar chave",
      ) as HTMLElement,
    )
    await waitFor(() => expect(rotate).toHaveBeenCalledTimes(1))
  })

  it("shows an error toast when generating fails", async () => {
    const user = userEvent.setup()
    vi.spyOn(api.settings.pingKey, "get").mockResolvedValue({ key: null })
    vi.spyOn(api.settings.pingKey, "rotate").mockRejectedValue(new Error("boom"))
    renderApp(<PingKey />)
    await user.click(await screen.findByRole("button", { name: "Gerar chave" }))
    expect(await screen.findByText("Não foi possível gerar a chave")).toBeInTheDocument()
  })
})
