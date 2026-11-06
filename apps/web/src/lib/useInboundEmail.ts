import { useQuery } from "@tanstack/react-query"
import { api } from "./api"

/** The ping-by-e-mail domain, or null when the server does not receive e-mail. */
export function useInboundEmailDomain(): string | null {
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api.settings.get() })
  return data?.inboundEmailDomain ?? null
}
