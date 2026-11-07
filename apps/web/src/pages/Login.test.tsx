import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, api } from "@/lib/api"
import { renderApp } from "@/test/render"
import LoginPage from "./Login"

const open = (url = "/login", config = { oidc: false, proxy: false, passwordLogin: true }) => {
  vi.spyOn(api.auth, "me").mockRejectedValue(new ApiError("API 401", 401, null))
  vi.spyOn(api.auth, "ssoConfig").mockResolvedValue(config)
  return renderApp(
    <MemoryRouter initialEntries={[url]}>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe("LoginPage sign-in methods", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("shows only the password form when no SSO is configured", async () => {
    open()
    expect(await screen.findByLabelText("Email")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /SSO/ })).not.toBeInTheDocument()
  })

  it("adds an SSO link next to the password form when OIDC is configured", async () => {
    open("/login", { oidc: true, proxy: false, passwordLogin: true })
    const link = await screen.findByRole("link", { name: "Entrar com SSO" })
    expect(link).toHaveAttribute("href", "/auth/sso/oidc/start")
    expect(screen.getByLabelText("Email")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument()
  })

  it("offers the proxy login as its own link", async () => {
    open("/login", { oidc: false, proxy: true, passwordLogin: true })
    const link = await screen.findByRole("link", { name: /login da sua organização/ })
    expect(link).toHaveAttribute("href", "/auth/sso/proxy")
  })

  it("hides the password form when password login is disabled", async () => {
    open("/login", { oidc: true, proxy: false, passwordLogin: false })
    expect(await screen.findByRole("link", { name: "Entrar com SSO" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Entrar" })).not.toBeInTheDocument()
    expect(screen.getByText("Este servidor usa login único (SSO).")).toBeInTheDocument()
  })

  it("explains a known sso_error and falls back to a generic message for an unknown one", async () => {
    open("/login?sso_error=not_allowed", { oidc: true, proxy: false, passwordLogin: true })
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta conta não tem acesso ao Cronko.",
    )
  })

  it("never renders markup from the sso_error parameter", async () => {
    open("/login?sso_error=%3Cimg%20src=x%3E", { oidc: true, proxy: false, passwordLogin: true })
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Não foi possível concluir o login único.")
    expect(alert.querySelector("img")).toBeNull()
  })

  it("keeps working when the SSO config cannot be loaded", async () => {
    vi.spyOn(api.auth, "me").mockRejectedValue(new ApiError("API 401", 401, null))
    vi.spyOn(api.auth, "ssoConfig").mockRejectedValue(new Error("down"))
    renderApp(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(await screen.findByLabelText("Email")).toBeInTheDocument()
  })

  it("still signs in with a password", async () => {
    const user = userEvent.setup()
    open()
    const login = vi
      .spyOn(api.auth, "login")
      .mockResolvedValue({ token: "t", email: "a@b.co", expiresAt: "x" })
    await user.type(await screen.findByLabelText("Email"), "ops@example.com")
    await user.type(screen.getByLabelText("Senha"), "pw-123456")
    await user.click(screen.getByRole("button", { name: "Entrar" }))
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: "ops@example.com", password: "pw-123456" }),
    )
  })
})
