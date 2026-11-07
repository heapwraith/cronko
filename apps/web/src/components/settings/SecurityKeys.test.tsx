import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, api } from "@/lib/api"
import { renderApp } from "@/test/render"
import { SecurityKeys } from "./SecurityKeys"

const browser = vi.hoisted(() => ({ startRegistration: vi.fn() }))
vi.mock("@simplewebauthn/browser", () => browser)

const key = (over: Record<string, unknown> = {}) => ({
  id: "cred-1",
  name: "Blue key",
  createdAt: "2026-01-01T00:00:00Z",
  lastUsedAt: null,
  ...over,
})

describe("SecurityKeys", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    browser.startRegistration.mockReset()
  })

  const open = (list: { available: boolean; credentials: ReturnType<typeof key>[] }) => {
    vi.spyOn(api.twoFactor.keys, "list").mockResolvedValue(list)
    renderApp(<SecurityKeys />)
    return userEvent.setup()
  }

  it("explains that PUBLIC_URL is needed when the server cannot do WebAuthn", async () => {
    open({ available: false, credentials: [] })
    expect(await screen.findByText(/Defina PUBLIC_URL/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Adicionar chave" })).not.toBeInTheDocument()
  })

  it("lists keys with their last use", async () => {
    open({
      available: true,
      credentials: [key(), key({ id: "c2", name: "Phone", lastUsedAt: "2026-02-02T10:00:00Z" })],
    })
    expect(await screen.findByText("Blue key")).toBeInTheDocument()
    expect(screen.getByText("Nunca usada")).toBeInTheDocument()
    expect(screen.getByText(/Último uso:/)).toBeInTheDocument()
  })

  it("adds a key: options, the browser prompt, then the verification, with a trimmed name", async () => {
    const user = open({ available: true, credentials: [] })
    const options = { challenge: "abc" } as never
    const attestation = { id: "new", type: "public-key" } as never
    const registerOptions = vi
      .spyOn(api.twoFactor.keys, "registerOptions")
      .mockResolvedValue(options)
    browser.startRegistration.mockResolvedValue(attestation)
    const verify = vi.spyOn(api.twoFactor.keys, "registerVerify").mockResolvedValue({ id: "new" })

    const add = await screen.findByRole("button", { name: "Adicionar chave" })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText("Nome da chave"), "  Green key ")
    await user.click(add)

    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1))
    expect(registerOptions).toHaveBeenCalledTimes(1)
    expect(browser.startRegistration).toHaveBeenCalledWith({ optionsJSON: options })
    expect(verify).toHaveBeenCalledWith({ name: "Green key", response: attestation })
    expect(await screen.findByText("Chave adicionada")).toBeInTheDocument()
  })

  it("says so when the browser prompt is cancelled, and never calls the server to verify", async () => {
    const user = open({ available: true, credentials: [] })
    vi.spyOn(api.twoFactor.keys, "registerOptions").mockResolvedValue({ challenge: "x" } as never)
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" })
    browser.startRegistration.mockRejectedValue(denied)
    const verify = vi.spyOn(api.twoFactor.keys, "registerVerify")

    await user.type(await screen.findByLabelText("Nome da chave"), "Key")
    await user.click(screen.getByRole("button", { name: "Adicionar chave" }))
    expect(
      await screen.findByText("O cadastro da chave foi cancelado ou expirou"),
    ).toBeInTheDocument()
    expect(verify).not.toHaveBeenCalled()
  })

  it("asks for the password before removing, and sends it", async () => {
    const user = open({ available: true, credentials: [key()] })
    const remove = vi.spyOn(api.twoFactor.keys, "remove").mockResolvedValue({ ok: true })

    await user.click(await screen.findByRole("button", { name: "Remover" }))
    const confirmBox = screen.getByText(/Remover a chave "Blue key"/).parentElement as HTMLElement
    const confirm = within(confirmBox).getByRole("button", { name: "Remover" })
    expect(confirm).toBeDisabled()
    expect(remove).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText("Senha"), "pw-123456")
    await user.click(confirm)
    await waitFor(() => expect(remove).toHaveBeenCalledWith("cred-1", "pw-123456"))
    expect(await screen.findByText("Chave removida")).toBeInTheDocument()
  })

  it("reports a wrong password and keeps the dialog open", async () => {
    const user = open({ available: true, credentials: [key()] })
    vi.spyOn(api.twoFactor.keys, "remove").mockRejectedValue(new ApiError("API 401", 401, null))
    await user.click(await screen.findByRole("button", { name: "Remover" }))
    await user.type(screen.getByLabelText("Senha"), "nope")
    const confirmBox = screen.getByText(/Remover a chave "Blue key"/).parentElement as HTMLElement
    await user.click(within(confirmBox).getByRole("button", { name: "Remover" }))
    expect(await screen.findByText("Senha incorreta")).toBeInTheDocument()
    expect(screen.getByText(/Remover a chave "Blue key"/)).toBeInTheDocument()
  })
})
