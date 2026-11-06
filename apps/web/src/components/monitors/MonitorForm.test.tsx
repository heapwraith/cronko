import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import { renderApp } from "@/test/render"
import { MonitorForm, type MonitorFormValues } from "./MonitorForm"

type Settings = Awaited<ReturnType<typeof api.settings.get>>

function setup(opts: { initial?: MonitorFormValues; inboundEmailDomain?: string | null } = {}) {
  vi.spyOn(api.settings, "get").mockResolvedValue({
    inboundEmailDomain: opts.inboundEmailDomain ?? null,
  } as Settings)
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  renderApp(
    <MonitorForm
      {...(opts.initial && { initial: opts.initial })}
      submitLabel="Salvar"
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  )
  return { user: userEvent.setup(), onSubmit, onCancel }
}

describe("MonitorForm", () => {
  beforeEach(() => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "UTC",
    } as Intl.ResolvedDateTimeFormatOptions)
  })

  it("rejects an empty name and does not submit", async () => {
    const { user, onSubmit } = setup()
    await user.click(screen.getByRole("button", { name: "Salvar" }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText("Nome é obrigatório")).toBeInTheDocument()
    expect(screen.getByLabelText("Nome")).toHaveAttribute("aria-invalid", "true")
  })

  it("submits an interval monitor with unit conversion and defaults", async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText("Nome"), "  backup  ")
    const amount = screen.getByRole("spinbutton", { name: "A cada" })
    await user.clear(amount)
    await user.type(amount, "2")
    await user.selectOptions(screen.getByRole("combobox", { name: "A cada" }), "hours")
    await user.click(screen.getByRole("button", { name: "Salvar" }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: "backup",
      expectedIntervalSeconds: 7200,
      gracePeriodSeconds: 120,
      alertOnAnomalies: false,
      tags: [],
    })
  })

  it("enforces the 10 second minimum interval", async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText("Nome"), "x")
    const amount = screen.getByRole("spinbutton", { name: "A cada" })
    await user.clear(amount)
    await user.type(amount, "5")
    await user.selectOptions(screen.getByRole("combobox", { name: "A cada" }), "seconds")
    await user.click(screen.getByRole("button", { name: "Salvar" }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("O intervalo mínimo é de 10 segundos.")
  })

  it("cron mode validates the expression and previews the next runs", async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText("Nome"), "nightly")
    await user.click(screen.getByLabelText("Expressão cron", { selector: "input[type=radio]" }))

    const cron = screen.getByLabelText("Expressão cron", {
      selector: "input[type=text], input:not([type])",
    })
    await user.type(cron, "not a cron")
    expect(screen.getByRole("alert")).toHaveTextContent("Expressão cron inválida.")
    await user.click(screen.getByRole("button", { name: "Salvar" }))
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Todo dia, 02:00" }))
    expect(cron).toHaveValue("0 2 * * *")
    expect(screen.getByText("Próximas execuções esperadas")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Salvar" }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "nightly", scheduleCron: "0 2 * * *", timezone: "UTC" }),
    )
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("expectedIntervalSeconds")
  })

  it("editing a cron monitor starts in cron mode; switching back sends scheduleCron null", async () => {
    const { user, onSubmit } = setup({
      initial: {
        name: "job",
        expectedIntervalSeconds: 3600,
        gracePeriodSeconds: 300,
        scheduleCron: "0 * * * *",
        timezone: "UTC",
      },
    })
    expect(
      screen.getByLabelText("Expressão cron", { selector: "input[type=text], input:not([type])" }),
    ).toHaveValue("0 * * * *")
    await user.click(screen.getByLabelText("A cada intervalo"))
    await user.click(screen.getByRole("button", { name: "Salvar" }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedIntervalSeconds: 3600,
        scheduleCron: null,
        gracePeriodSeconds: 300,
      }),
    )
  })

  it("shows the interval in its largest whole unit when editing", () => {
    setup({ initial: { name: "j", expectedIntervalSeconds: 172_800, gracePeriodSeconds: 60 } })
    expect(screen.getByRole("spinbutton", { name: "A cada" })).toHaveValue(2)
    expect(screen.getByRole("combobox", { name: "A cada" })).toHaveValue("days")
  })

  it("sends the max duration in ms and omits it when blank", async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText("Nome"), "a")
    await user.type(screen.getByLabelText(/Duração máxima/i), "2")
    await user.click(screen.getByRole("button", { name: "Salvar" }))
    expect(onSubmit.mock.calls[0]?.[0].maxDurationMs).toBe(120_000)
  })

  it("only offers email failure keywords when inbound email is configured", async () => {
    setup()
    expect(screen.queryByPlaceholderText("error, failed, falha")).not.toBeInTheDocument()
  })

  it("sends parsed email failure keywords when inbound email is on", async () => {
    const { user, onSubmit } = setup({ inboundEmailDomain: "ping.example.com" })
    const kw = await screen.findByPlaceholderText("error, failed, falha")
    await user.type(screen.getByLabelText("Nome"), "mail")
    await user.type(kw, "boom, , fail ")
    await user.click(screen.getByRole("button", { name: "Salvar" }))
    expect(onSubmit.mock.calls[0]?.[0].emailFailureKeywords).toEqual(["boom", "fail"])
  })

  it("calls onCancel", async () => {
    const { user, onCancel } = setup()
    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(onCancel).toHaveBeenCalled()
  })
})
