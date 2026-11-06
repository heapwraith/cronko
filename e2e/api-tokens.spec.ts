import { expect, type Page, test } from "@playwright/test"
import { login } from "./helpers"

async function createToken(page: Page, name: string, scope: "read" | "write") {
  await page.getByLabel("Nome", { exact: true }).fill(name)
  await page.getByLabel("Permissão").selectOption(scope)
  await page.getByRole("button", { name: "Criar token" }).click()
  const secret = (await page.getByRole("status").locator("code").textContent())?.trim() ?? ""
  expect(secret).toMatch(/^crk_/)
  return secret
}

test("API tokens: scoped access over HTTP, secret shown once, revoke cuts access", async ({
  page,
  request,
}) => {
  await login(page)
  await page.goto("/settings")

  const readName = `e2e-read-${Date.now()}`
  const readSecret = await createToken(page, readName, "read")

  // The secret is displayed once: after dismissing it, it is gone from the page.
  await page.getByRole("button", { name: "Fechar" }).click()
  await expect(page.getByText(readSecret)).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(readName)).toBeVisible()
  await expect(page.getByText(readSecret)).toHaveCount(0)

  const auth = { Authorization: `Bearer ${readSecret}` }

  // Read scope: GET works, writes are forbidden.
  expect((await request.get("/api/monitors", { headers: auth })).status()).toBe(200)
  const denied = await request.post("/api/monitors", {
    headers: auth,
    data: { name: "should-not-exist", expectedIntervalSeconds: 3600, gracePeriodSeconds: 60 },
  })
  expect(denied.status()).toBe(403)

  // A write token may create monitors.
  const writeSecret = await createToken(page, `e2e-write-${Date.now()}`, "write")
  const created = await request.post("/api/monitors", {
    headers: { Authorization: `Bearer ${writeSecret}` },
    data: {
      name: `e2e-token-${Date.now()}`,
      expectedIntervalSeconds: 3600,
      gracePeriodSeconds: 60,
    },
  })
  expect(created.status()).toBe(201)

  // Revoke the read token through the UI; it stops working immediately.
  const row = page.getByRole("listitem").filter({ hasText: readName })
  await row.getByRole("button", { name: "Revogar" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Revogar" }).click()
  await expect(page.getByText("Token revogado")).toBeVisible()
  await expect(row.getByRole("button", { name: "Revogar" })).toHaveCount(0)

  expect((await request.get("/api/monitors", { headers: auth })).status()).toBe(401)
})
