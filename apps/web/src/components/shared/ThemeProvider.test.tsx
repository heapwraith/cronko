import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider, useTheme } from "./ThemeProvider"

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>

function mockMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>()
  const mq = {
    matches: dark,
    addEventListener: (_: string, h: () => void) => listeners.add(h),
    removeEventListener: (_: string, h: () => void) => listeners.delete(h),
  }
  vi.stubGlobal("matchMedia", () => mq)
  return {
    set(next: boolean) {
      mq.matches = next
      for (const h of listeners) h()
    },
  }
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark")
    mockMatchMedia(false)
  })

  it("defaults to dark when nothing is stored", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe("dark")
    expect(document.documentElement).toHaveClass("dark")
  })

  it("restores a stored light theme", () => {
    localStorage.setItem("cronko_theme", "light")
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.resolved).toBe("light")
    expect(document.documentElement).not.toHaveClass("dark")
  })

  it("setTheme persists and toggles the class", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme("light"))
    expect(localStorage.getItem("cronko_theme")).toBe("light")
    expect(document.documentElement).not.toHaveClass("dark")
    act(() => result.current.setTheme("dark"))
    expect(document.documentElement).toHaveClass("dark")
  })

  it("system follows prefers-color-scheme, including live changes", () => {
    const mq = mockMatchMedia(true)
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme("system"))
    expect(result.current.resolved).toBe("dark")
    act(() => mq.set(false))
    expect(result.current.resolved).toBe("light")
    expect(document.documentElement).not.toHaveClass("dark")
  })

  it("uses the view transition API when available", () => {
    const start = vi.fn((cb: () => void) => cb())
    Object.defineProperty(document, "startViewTransition", { value: start, configurable: true })
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme("light"))
    expect(start).toHaveBeenCalled()
    Reflect.deleteProperty(document, "startViewTransition")
  })

  it("useTheme throws outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/)
  })
})
