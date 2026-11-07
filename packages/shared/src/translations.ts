import { enUS } from "./locales/en-US"
import { ptBR } from "./locales/pt-BR"

export type Locale = "pt-BR" | "en-US"

export type TranslationKey = string

export const translations = {
  "pt-BR": ptBR,
  "en-US": enUS,
} as const

export function t(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const dict = translations[locale] as Record<string, string> | undefined
  const fallback = translations["en-US"] as Record<string, string>
  let text = dict?.[key] ?? fallback[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}
