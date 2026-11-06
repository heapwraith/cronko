import { describe, expect, it } from "vitest"
import { heartbeats, incidents, monitors, settings, users } from "../schema"

describe("Database smoke tests", () => {
  it("exports schema tables", () => {
    expect(monitors).toBeDefined()
    expect(heartbeats).toBeDefined()
    expect(incidents).toBeDefined()
    expect(users).toBeDefined()
    expect(settings).toBeDefined()
  })
})
