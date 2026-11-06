import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, api } from "@/lib/api"
import { renderApp } from "@/test/render"
import NotificationsPage from "./Notifications"

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
      config: { url: "http://localhost:9/hook" },
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
})
