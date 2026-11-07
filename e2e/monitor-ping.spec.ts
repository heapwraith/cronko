import { expect, test } from "@playwright/test"
import { createMonitor, login } from "./helpers"

test("a new monitor turns healthy after its first ping", async ({ page, request }) => {
  await login(page)
  const { name, pingUrl } = await createMonitor(page, "e2e-healthy")

  // Nothing has pinged yet, so the monitor is not healthy.
  await expect(page.getByText("Saudável")).toHaveCount(0)

  const res = await request.post(pingUrl, { data: "all good" })
  expect(res.ok()).toBeTruthy()

  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
  await expect(page.getByText("Saudável").first()).toBeVisible()

  // The monitors list agrees.
  await page.goto("/monitors")
  await expect(
    page.getByRole("row", { name: new RegExp(name) }).getByText("Saudável"),
  ).toBeVisible()
})
