import type { ReactNode } from "react"
import { ThemeProvider } from "./ThemeProvider"
import { ToastProvider } from "./Toast"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  )
}
