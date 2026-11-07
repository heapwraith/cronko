import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, api } from "@/lib/api"
import { renderApp } from "@/test/render"
import NotificationsPage from "./Notifications"

const push = vi.hoisted(() => ({
  supported: true,
  impl: async (_key: string): Promise<unknown> => ({}),
}))
vi.mock("@/lib/webpush", async (orig) => ({
  ...(await orig<typeof import("@/lib/webpush")>()),
  pushSupported: () => push.supported,
  subscribeThisDevice: (key: string) => push.impl(key),
}))

describe("NotificationsPage add-channel flow", () => {
  beforeEach(() => {
    vi.spyOn(api.notifications, "list").mockResolvedValue([])
    vi.spyOn(api.notifications, "deliveries").mockResolvedValue([])
    vi.spyOn(api.maintenance, "list").mockResolvedValue([])
    vi.spyOn(api.monitors, "list").mockResolvedValue([])
  })

  async function openForm() {
    const user = userEvent.setup()
    renderApp(<NotificationsPage />)
    await user.click(
      (await screen.findAllByRole("button", { name: /Adicionar Canal/ })).at(0) as HTMLElement,
    )
    return { user, form: await screen.findByRole("form", { name: "Adicionar Canal" }) }
  }

  it("blocks create on client-side validation errors", async () => {
    const create = vi.spyOn(api.notifications, "create")
    const { user, form } = await openForm()
    await user.type(within(form).getByLabelText("URL do Webhook"), "http://insecure.test")
    await user.click(within(form).getByRole("button", { name: "Criar Canal" }))
    expect(create).not.toHaveBeenCalled()
    expect(await within(form).findByText("Use uma URL começando com https://")).toBeInTheDocument()
  })

  it("creates a webhook channel with a trimmed config", async () => {
    const create = vi
      .spyOn(api.notifications, "create")
      .mockResolvedValue({ id: "c1", name: "Webhook" })
    const { user, form } = await openForm()
    await user.selectOptions(within(form).getByLabelText("Tipo"), "webhook")
    await user.type(within(form).getByLabelText("URL"), " http://localhost:9/hook ")
    await user.click(within(form).getByRole("button", { name: "Criar Canal" }))
    expect(create).toHaveBeenCalledWith({
      name: "Webhook",
      type: "webhook",
      // The optional headers and body template are sent blank; the API treats
      // a blank template as "use the default payload".
      config: { url: "http://localhost:9/hook", headers: "", bodyTemplate: "" },
    })
    expect(await screen.findByText("Canal criado com sucesso")).toBeInTheDocument()
  })

  it("shows server-side field errors from a 400", async () => {
    vi.spyOn(api.notifications, "create").mockRejectedValue(
      new ApiError("API 400", 400, {
        error: { issues: [{ path: ["config", "url"], message: "URL bloqueada" }] },
      }),
    )
    const { user, form } = await openForm()
    await user.selectOptions(within(form).getByLabelText("Tipo"), "webhook")
    await user.type(within(form).getByLabelText("URL"), "http://10.0.0.1/x")
    await user.click(within(form).getByRole("button", { name: "Criar Canal" }))
    expect(await within(form).findByText("URL bloqueada")).toBeInTheDocument()
  })
  describe("Web Push", () => {
    beforeEach(() => {
      push.supported = true
      push.impl = async () => ({
        endpoint: "https://push.example/abc",
        keys: { p256dh: "P", auth: "A" },
      })
    })

    it("subscribes this browser and stores the subscription as the channel config", async () => {
      vi.spyOn(api.notifications, "webPushKey").mockResolvedValue({ publicKey: "PUB" })
      const create = vi
        .spyOn(api.notifications, "create")
        .mockResolvedValue({ id: "c1", name: "Web Push" })
      const { user, form } = await openForm()
      await user.selectOptions(within(form).getByLabelText("Tipo"), "webpush")
      expect(within(form).getByText(/o navegador pede permissão/)).toBeInTheDocument()
      await user.click(within(form).getByRole("button", { name: "Criar Canal" }))
      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({
          name: "Web Push",
          type: "webpush",
          config: { endpoint: "https://push.example/abc", keys: { p256dh: "P", auth: "A" } },
        }),
      )
    })

    it("explains when the browser cannot do push, without calling the server", async () => {
      push.supported = false
      const create = vi.spyOn(api.notifications, "create")
      const key = vi.spyOn(api.notifications, "webPushKey")
      const { user, form } = await openForm()
      await user.selectOptions(within(form).getByLabelText("Tipo"), "webpush")
      await user.click(within(form).getByRole("button", { name: "Criar Canal" }))
      expect(await screen.findByText(/não suporta notificações push/)).toBeInTheDocument()
      expect(key).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    })

    it("says so when the permission is refused, and creates nothing", async () => {
      const { PushDenied } = await import("@/lib/webpush")
      vi.spyOn(api.notifications, "webPushKey").mockResolvedValue({ publicKey: "PUB" })
      push.impl = async () => {
        throw new PushDenied()
      }
      const create = vi.spyOn(api.notifications, "create")
      const { user, form } = await openForm()
      await user.selectOptions(within(form).getByLabelText("Tipo"), "webpush")
      await user.click(within(form).getByRole("button", { name: "Criar Canal" }))
      expect(
        await screen.findByText("A permissão de notificações não foi concedida."),
      ).toBeInTheDocument()
      expect(create).not.toHaveBeenCalled()
    })
  })
})
