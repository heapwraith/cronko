"use client"

import type { ReactNode } from "react"
import { CommandPalette } from "./CommandPalette"
import { KeyboardShortcuts } from "./KeyboardShortcuts"
import { ThemeProvider } from "./ThemeProvider"
import { ToastProvider } from "./Toast"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        {children}
        <CommandPalette />
        <KeyboardShortcuts />
      </ToastProvider>
    </ThemeProvider>
  )
}
