import { describe, expect, it } from "vitest"
import { auth } from "../locales/pt-BR/auth"
import { core } from "../locales/pt-BR/core"
import { howto } from "../locales/pt-BR/howto"
import { monitors } from "../locales/pt-BR/monitors"
import { notifications } from "../locales/pt-BR/notifications"
import { settings } from "../locales/pt-BR/settings"
import { status } from "../locales/pt-BR/status"
import { t, translations } from "../translations"

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe("translations", () => {
  const pt = translations["pt-BR"] as Record<string, string>
  const en = translations["en-US"] as Record<string, string>

  it("has the same keys in both languages", () => {
    const only = (a: object, b: object) => Object.keys(a).filter((k) => !(k in b))
    expect(only(pt, en)).toEqual([])
    expect(only(en, pt)).toEqual([])
  })

  it("has no empty strings", () => {
    for (const dict of [pt, en]) {
      for (const [key, value] of Object.entries(dict)) expect(value.trim(), key).not.toBe("")
    }
  })

  it("uses the same {placeholders} in both languages", () => {
    for (const key of Object.keys(pt)) {
      expect(placeholders(pt[key] ?? ""), key).toEqual(placeholders(en[key] ?? ""))
    }
  })

  it("keeps each key in exactly one module", () => {
    const modules = { auth, core, howto, monitors, notifications, settings, status }
    const seen = new Map<string, string>()
    for (const [name, dict] of Object.entries(modules)) {
      for (const key of Object.keys(dict)) {
        expect(seen.get(key), `${key} is in ${name} and ${seen.get(key)}`).toBeUndefined()
        seen.set(key, name)
      }
    }
    expect(seen.size).toBe(Object.keys(pt).length)
  })

  it("falls back to English, then to the key, and fills params", () => {
    expect(t("pt-BR", "no.such.key")).toBe("no.such.key")
    expect(t("en-US", "common.never")).toBe(en["common.never"])
    expect(t("en-US", "no.such.key {x}", { x: 1 })).toBe("no.such.key 1")
  })
})
