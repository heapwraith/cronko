import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, api } from "@/lib/api"
import { renderApp } from "@/test/render"
import LoginPage from "./Login"

// A plain delegating function, not a vi.fn: the tooling around vi.fn flags a rejected
// result as unhandled even though the component catches it.
const browser = vi.hoisted(() => {
  const state = {
    impl: (async () => ({})) as (opts: unknown) => Promise<unknown>,
    calls: [] as unknown[],
  }
  return {
    state,
    startAuthentication: (opts: unknown) => {
      state.calls.push(opts)
      return state.impl(opts)
    },
  }
})
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: browser.startAuthentication }))

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
  describe("security key as the second step", () => {
    const withKey = async () => {
      const user = userEvent.setup()
      open()
      vi.spyOn(api.auth, "login").mockResolvedValue({
        twoFactorRequired: true,
        challenge: "login-token",
        webauthn: { challenge: "wa-challenge" } as never,
      })
      await user.type(await screen.findByLabelText("Email"), "ops@example.com")
      await user.type(screen.getByLabelText("Senha"), "pw-123456")
      await user.click(screen.getByRole("button", { name: "Entrar" }))
      return user
    }

    beforeEach(() => {
      browser.state.calls.length = 0
      browser.state.impl = async () => ({})
    })

    it("offers the key only when the server sent options for it", async () => {
      const user = userEvent.setup()
      open()
      vi.spyOn(api.auth, "login").mockResolvedValue({
        twoFactorRequired: true,
        challenge: "login-token",
      })
      await user.type(await screen.findByLabelText("Email"), "a@b.co")
      await user.type(screen.getByLabelText("Senha"), "x")
      await user.click(screen.getByRole("button", { name: "Entrar" }))
      expect(await screen.findByLabelText("Código")).toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: "Usar chave de segurança" }),
      ).not.toBeInTheDocument()
    })

    it("signs in with the key: the browser answer goes to the server with the login token", async () => {
      const user = await withKey()
      const assertion = { id: "cred", type: "public-key" } as never
      browser.state.impl = async () => assertion
      const loginWebauthn = vi
        .spyOn(api.auth, "loginWebauthn")
        .mockResolvedValue({ token: "t", email: "a@b.co", expiresAt: "x" })
      await user.click(await screen.findByRole("button", { name: "Usar chave de segurança" }))
      await waitFor(() =>
        expect(loginWebauthn).toHaveBeenCalledWith({
          challenge: "login-token",
          response: assertion,
        }),
      )
      expect(browser.state.calls).toEqual([{ optionsJSON: { challenge: "wa-challenge" } }])
    })

    it("stays on the same step when the browser prompt is cancelled", async () => {
      const user = await withKey()
      // What browsers really throw when the user dismisses the prompt.
      browser.state.impl = () => Promise.reject(new DOMException("denied", "NotAllowedError"))
      const loginWebauthn = vi.spyOn(api.auth, "loginWebauthn")
      await user.click(await screen.findByRole("button", { name: "Usar chave de segurança" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("Autenticação cancelada")
      expect(loginWebauthn).not.toHaveBeenCalled()
      expect(screen.getByRole("button", { name: "Usar chave de segurança" })).toBeInTheDocument()
    })

    it("goes back to the password when the server refuses the key", async () => {
      const user = await withKey()
      browser.state.impl = async () => ({ id: "c", type: "public-key" })
      vi.spyOn(api.auth, "loginWebauthn").mockRejectedValue(new ApiError("API 401", 401, null))
      await user.click(await screen.findByRole("button", { name: "Usar chave de segurança" }))
      expect(await screen.findByRole("alert")).toHaveTextContent("A chave não foi aceita")
      expect(await screen.findByLabelText("Email")).toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: "Usar chave de segurança" }),
      ).not.toBeInTheDocument()
    })
  })
})
