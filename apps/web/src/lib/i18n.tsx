import { type Locale, t } from "@cronko/shared/translations"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react"

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: "pt-BR",
  setLocale: () => {},
  t: (key: string) => key,
})

// eslint-disable-next-line react-refresh/only-export-components
export function useT() {
  return useContext(I18nContext)
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "pt-BR"
    const stored = localStorage.getItem("cronko_locale") as Locale | null
    return stored === "pt-BR" || stored === "en-US" ? stored : "pt-BR"
  })

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem("cronko_locale", next)
  }, [])

  const translate = useCallback(
    (key: string, params?: Record<string, string | number>) => t(locale, key, params),
    [locale],
  )

  useEffect(() => {
    document.documentElement.lang = locale === "en-US" ? "en" : "pt-BR"
  }, [locale])

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: translate }}>
      {children}
    </I18nContext.Provider>
  )
}
