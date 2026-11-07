import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import { renderApp } from "@/test/render"
import { ApiTokens } from "./ApiTokens"

const token = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  name: "ci",
  prefix: "ck_abcd",
  scope: "read" as const,
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  status: "active" as const,
  ...over,
})

describe("ApiTokens", () => {
  beforeEach(() => {
    vi.spyOn(api.settings.tokens, "list").mockResolvedValue([])
  })

  it("shows the empty state", async () => {
    renderApp(<ApiTokens />)
    expect(await screen.findByText("Nenhum token ainda.")).toBeInTheDocument()
  })

  it("keeps Criar disabled until a name is typed, then shows the secret once", async () => {
    const user = userEvent.setup()
    const create = vi
      .spyOn(api.settings.tokens, "create")
      .mockResolvedValue({ ...token({ scope: "write" }), token: "ck_SECRET_VALUE" })
    renderApp(<ApiTokens />)

    const button = screen.getByRole("button", { name: "Criar token" })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText("Nome"), "  deploy  ")
    await user.selectOptions(screen.getByLabelText("Permissão"), "write")
    await user.type(screen.getByLabelText(/Expira/), "30")
    await user.click(button)

    expect(create).toHaveBeenCalledWith({ name: "deploy", scope: "write", expiresInDays: 30 })
    const status = await screen.findByRole("status")
    expect(within(status).getByText("ck_SECRET_VALUE")).toBeInTheDocument()
    // The form resets after creation.
    expect(screen.getByLabelText("Nome")).toHaveValue("")

    await user.click(within(status).getByRole("button", { name: "Fechar" }))
    expect(screen.queryByText("ck_SECRET_VALUE")).not.toBeInTheDocument()
  })

  it("creates with Enter and omits expiry when blank", async () => {
    const user = userEvent.setup()
    const create = vi
      .spyOn(api.settings.tokens, "create")
      .mockResolvedValue({ ...token(), token: "ck_X" })
    renderApp(<ApiTokens />)
    await user.type(screen.getByLabelText("Nome"), "ro{Enter}")
    expect(create).toHaveBeenCalledWith({ name: "ro", scope: "read" })
  })

  it("reports a creation failure and shows no secret", async () => {
    const user = userEvent.setup()
    vi.spyOn(api.settings.tokens, "create").mockRejectedValue(new Error("boom"))
    renderApp(<ApiTokens />)
    await user.type(screen.getByLabelText("Nome"), "x")
    await user.click(screen.getByRole("button", { name: "Criar token" }))
    expect(await screen.findByText("Não foi possível criar o token")).toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("revokes only after confirmation, and only active tokens have the button", async () => {
    const user = userEvent.setup()
    vi.spyOn(api.settings.tokens, "list").mockResolvedValue([
      token(),
      token({ id: "t2", name: "old", status: "revoked", revokedAt: "2026-01-02T00:00:00Z" }),
    ])
    const revoke = vi.spyOn(api.settings.tokens, "revoke").mockResolvedValue({ id: "t1" })
    renderApp(<ApiTokens />)

    await screen.findByText("old")
    const revokeButtons = screen.getAllByRole("button", { name: "Revogar", hidden: true })
    // One list button (active token) + the dialog's confirm button.
    expect(revokeButtons).toHaveLength(2)

    await user.click(screen.getAllByRole("button", { name: "Revogar" }).at(0) as HTMLElement)
    expect(revoke).not.toHaveBeenCalled()
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Revogar" }))

    await waitFor(() => expect(revoke).toHaveBeenCalledWith("t1"))
    expect(await screen.findByText("Token revogado")).toBeInTheDocument()
  })

  it("cancelling the dialog does not revoke", async () => {
    const user = userEvent.setup()
    vi.spyOn(api.settings.tokens, "list").mockResolvedValue([token()])
    const revoke = vi.spyOn(api.settings.tokens, "revoke").mockResolvedValue({ id: "t1" })
    renderApp(<ApiTokens />)
    await user.click(await screen.findByRole("button", { name: "Revogar" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }))
    expect(revoke).not.toHaveBeenCalled()
  })

  it("toasts when revoking fails", async () => {
    const user = userEvent.setup()
    vi.spyOn(api.settings.tokens, "list").mockResolvedValue([token()])
    vi.spyOn(api.settings.tokens, "revoke").mockRejectedValue(new Error("x"))
    renderApp(<ApiTokens />)
    await user.click(await screen.findByRole("button", { name: "Revogar" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Revogar" }))
    expect(await screen.findByText("Não foi possível revogar o token")).toBeInTheDocument()
  })
})
