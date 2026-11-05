import type { Metadata, Viewport } from "next"
import { Providers } from "@/components/shared/Providers"
import { I18nProvider } from "@/lib/i18n"
import "./globals.css"

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#10b981" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
}

export const metadata: Metadata = {
  title: {
    default: "Cronko",
    template: "%s — Cronko",
  },
  description: "Know when your jobs stop running.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.json",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body className="bg-[#f6f8fa] text-[#1a1f36] dark:bg-zinc-950 dark:text-zinc-100 font-sans antialiased transition-colors">
        <Providers>
          <I18nProvider>{children}</I18nProvider>
        </Providers>
      </body>
    </html>
  )
}
