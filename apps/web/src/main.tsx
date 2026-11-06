import "@fontsource-variable/newsreader"
import "@fontsource-variable/atkinson-hyperlegible-next"
import "@fontsource-variable/geist-mono"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./globals.css"

const root = document.getElementById("root")
if (!root) throw new Error("#root not found")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").catch(() => {})
}
