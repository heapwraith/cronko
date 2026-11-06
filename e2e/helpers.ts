import { expect, type Page } from "@playwright/test"
import { ADMIN } from "../playwright.config"

export async function login(page: Page) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(ADMIN.email)
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password)
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

/** Create a monitor through the UI; returns its name and its ping URL. */
export async function createMonitor(page: Page, prefix: string) {
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  await page.goto("/monitors/new")
  await page.getByLabel("Nome").fill(name)
  await page.getByRole("button", { name: "Criar Monitor" }).click()
  await expect(page).toHaveURL(/\/monitors\/[^/]+$/)
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
  const pingUrl =
    (await page.locator("code", { hasText: "/ping/" }).first().textContent())?.trim() ?? ""
  expect(pingUrl).toContain("/ping/")
  return { name, pingUrl }
}
