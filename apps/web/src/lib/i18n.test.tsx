import { act, render, renderHook, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { I18nProvider, useT } from "./i18n"

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>

function Probe() {
  return <span>{useT().t("form.name")}</span>
}

describe("i18n", () => {
  it("defaults to pt-BR and sets the document language", () => {
    const { result } = renderHook(() => useT(), { wrapper })
    expect(result.current.locale).toBe("pt-BR")
    expect(result.current.t("form.name")).toBe("Nome")
    expect(document.documentElement.lang).toBe("pt-BR")
  })

  it("restores a stored locale and ignores unknown values", () => {
    localStorage.setItem("cronko_locale", "en-US")
    expect(renderHook(() => useT(), { wrapper }).result.current.locale).toBe("en-US")
    localStorage.setItem("cronko_locale", "fr-FR")
    expect(renderHook(() => useT(), { wrapper }).result.current.locale).toBe("pt-BR")
  })

  it("switches locale, persists it and updates <html lang>", () => {
    const { result } = renderHook(() => useT(), { wrapper })
    act(() => result.current.setLocale("en-US"))
    expect(result.current.t("form.name")).toBe("Name")
    expect(localStorage.getItem("cronko_locale")).toBe("en-US")
    expect(document.documentElement.lang).toBe("en")
  })

  it("interpolates params and falls back to the key", () => {
    const { result } = renderHook(() => useT(), { wrapper })
    expect(result.current.t("does.not.exist")).toBe("does.not.exist")
    expect(result.current.t("settings.tokensRevokeMessage", { name: "ci" })).toContain("ci")
  })

  it("without a provider, t echoes the key", () => {
    render(<Probe />)
    expect(screen.getByText("form.name")).toBeInTheDocument()
  })
})
