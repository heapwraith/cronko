import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const api = process.env.CRONKO_API_URL ?? "http://localhost:3001"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // In dev the SPA runs on :3000 and proxies to the API so cookies stay same-origin.
  server: {
    port: 3000,
    proxy: Object.fromEntries(
      ["/api", "/auth", "/ping", "/health", "/badge"].map((p) => [p, { target: api }]),
    ),
  },
  build: { outDir: "dist", sourcemap: true },
})
