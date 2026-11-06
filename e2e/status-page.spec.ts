import { expect, test } from "@playwright/test"
import { ADMIN } from "../playwright.config"

test("a published status page is visible without a session; a draft is not", async ({
  page,
  browser,
}) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(ADMIN.email)
  await page.getByLabel("Senha", { exact: true }).fill(ADMIN.password)
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // A tagged monitor for the page to show.
  const name = `e2e-public-${Date.now()}`
  await page.goto("/monitors/new")
  await page.getByLabel("Nome").fill(name)
  const tags = page.getByLabel("Tags", { exact: true })
  await tags.fill("e2e-status")
  await tags.press("Enter")
  await page.getByRole("button", { name: "Criar Monitor" }).click()
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()

  // Create the page as a draft.
  const slug = `e2e-${Date.now()}`
  await page.goto("/status-pages")
  await page.getByRole("button", { name: "Nova página" }).click()
  await page.getByLabel("Título").fill("E2E status")
  await page.getByLabel("Endereço").fill(slug)
  await page.getByLabel("Tag dos monitores").fill("e2e-status")
  await page.getByRole("button", { name: "Criar página" }).click()
  await expect(page.getByText(`/status/${slug}`)).toBeVisible()

  // A visitor with no cookies at all.
  const visitor = await browser.newContext()
  const v = await visitor.newPage()
  await v.goto(`/status/${slug}`)
  await expect(v.getByText("Página de status não encontrada.")).toBeVisible()

  // Publish, then the same visitor sees it, with no session.
  await page.getByRole("switch", { name: "Publicada" }).click()
  await v.reload()
  await expect(v.getByRole("heading", { level: 1, name: "E2E status" })).toBeVisible()
  await expect(v.getByRole("heading", { level: 2, name })).toBeVisible()
  await expect(v.getByText("Todos os sistemas operando normalmente")).toBeVisible()
  await visitor.close()
})
