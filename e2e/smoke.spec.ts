import { expect, test } from "@playwright/test"
import { ADMIN } from "../playwright.config"

test("login → create monitor → failing ping → open the run", async ({ page, request }) => {
  // Log in as the bootstrap admin.
  await page.goto("/login")
  await page.getByLabel("Email").fill(ADMIN.email)
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password)
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // Create a monitor; the app lands on its detail page.
  const name = `e2e-backup-${Date.now()}`
  await page.goto("/monitors/new")
  await page.getByLabel("Nome").fill(name)
  await page.getByRole("button", { name: "Criar Monitor" }).click()
  await expect(page).toHaveURL(/\/monitors\/[^/]+$/)
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()

  // Read the ping URL shown to the user and report a failed run with output.
  const pingUrl =
    (await page.locator("code", { hasText: "/ping/" }).first().textContent())?.trim() ?? ""
  const res = await request.post(`${pingUrl}/fail?exit=2&d=1500`, {
    headers: { "content-type": "text/plain" },
    data: "starting backup\nERROR disk full on /var/backups\naborting",
  })
  expect(res.ok()).toBeTruthy()

  // The detail page shows the failure and links to the run.
  await page.reload()
  await expect(page.getByText("Falhou").first()).toBeVisible()
  await page.getByRole("table").getByRole("link").first().click()

  // The run page shows the job output and the exit code.
  await expect(page).toHaveURL(/\/monitors\/[^/]+\/runs\/[^/]+$/)
  await expect(page.getByText("ERROR disk full on /var/backups")).toBeVisible()
  await expect(page.getByText("falha").first()).toBeVisible()
  await expect(page.getByText("Nenhuma execução com sucesso antes desta.")).toBeVisible()
})
