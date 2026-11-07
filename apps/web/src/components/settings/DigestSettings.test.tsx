import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { renderApp } from "@/test/render"
import { DigestSettings } from "./DigestSettings"
import { DEFAULTS, type SettingsData } from "./model"

const setup = (over: Partial<SettingsData> = {}, sending = false) => {
  const onChange = vi.fn()
  const onSendTest = vi.fn()
  renderApp(
    <DigestSettings
      settings={{ ...DEFAULTS, ...over }}
      onChange={onChange}
      sending={sending}
      onSendTest={onSendTest}
    />,
  )
  return { onChange, onSendTest, user: userEvent.setup() }
}

describe("DigestSettings", () => {
  it("disables the hour while the digest is off", () => {
    setup()
    expect(screen.getByLabelText(/Horário/)).toBeDisabled()
  })

  it("reports a frequency change and enables the hour", async () => {
    const { onChange, user } = setup()
    await user.selectOptions(screen.getByLabelText("Frequência"), "weekly")
    expect(onChange).toHaveBeenCalledWith("digestFrequency", "weekly")
  })

  it("reports an hour change as a number", async () => {
    const { onChange, user } = setup({ digestFrequency: "daily" })
    await user.selectOptions(screen.getByLabelText(/Horário/), "18")
    expect(onChange).toHaveBeenCalledWith("digestHour", 18)
  })

  it("sends a test", async () => {
    const { onSendTest, user } = setup({ digestFrequency: "daily" })
    await user.click(screen.getByRole("button", { name: /Enviar um agora/ }))
    expect(onSendTest).toHaveBeenCalledTimes(1)
  })

  it("disables the test button while a send is in progress", () => {
    setup({ digestFrequency: "daily" }, true)
    expect(screen.getByRole("button", { name: /Enviar um agora/ })).toBeDisabled()
  })
})
