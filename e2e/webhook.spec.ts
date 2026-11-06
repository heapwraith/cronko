import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { expect, test } from "@playwright/test"
import { createMonitor, login } from "./helpers"

type Received = { event: string; monitor: string | null; message: string }

test("a webhook channel receives a delivery after a failing ping", async ({ page, request }) => {
  // Tiny receiver that records every JSON body Cronko POSTs.
  const received: Received[] = []
  const server = createServer((req, res) => {
    let raw = ""
    req.on("data", (chunk) => {
      raw += chunk
    })
    req.on("end", () => {
      try {
        received.push(JSON.parse(raw))
      } catch {
        // ignore non-JSON
      }
      res.writeHead(200).end("ok")
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`

  try {
    await login(page)

    const channelName = `e2e-hook-${Date.now()}`
    await page.goto("/notifications")
    await page
      .getByRole("button", { name: /Adicionar Canal/ })
      .first()
      .click()
    const form = page.getByRole("form", { name: "Adicionar Canal" })
    await form.getByLabel("Tipo").selectOption("webhook")
    await form.getByLabel("Nome").fill(channelName)
    await form.getByLabel("URL", { exact: true }).fill(hookUrl)
    await form.getByRole("button", { name: "Criar Canal" }).click()
    await expect(page.getByText("Canal criado com sucesso")).toBeVisible()
    await expect(page.getByText(channelName).first()).toBeVisible()

    const { name, pingUrl } = await createMonitor(page, "e2e-webhook")
    const res = await request.post(`${pingUrl}/fail?exit=1`, { data: "boom" })
    expect(res.ok()).toBeTruthy()

    // The outbox worker is kicked immediately; allow a few seconds regardless.
    await expect
      .poll(() => received.find((r) => r.monitor === name), { timeout: 15_000 })
      .toBeTruthy()
    expect(received.find((r) => r.monitor === name)?.message).toContain(name)

    // The delivery shows up in the log.
    await page.goto("/notifications")
    await expect(page.getByText(name).first()).toBeVisible()
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
