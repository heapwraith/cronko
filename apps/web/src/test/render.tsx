import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import { Providers } from "@/components/shared/Providers"
import { I18nProvider } from "@/lib/i18n"

export function renderApp(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <I18nProvider>
          <Providers>{ui}</Providers>
        </I18nProvider>
      </QueryClientProvider>,
    ),
  }
}
