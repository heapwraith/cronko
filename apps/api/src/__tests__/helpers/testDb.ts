import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const MIGRATIONS = resolve(__dirname, "../../../../../packages/database/src/migrations")

/**
 * Point the database package at a fresh, fully migrated SQLite file.
 * Call in beforeAll, BEFORE importing anything that touches @cronko/database
 * (use dynamic import() afterwards): the connection is created at import time.
 */
export async function setupTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "cronko-test-"))
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`

  const { db, sqliteClient } = await import("@cronko/database")
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator")
  migrate(db, { migrationsFolder: MIGRATIONS })

  return {
    db,
    reset() {
      sqliteClient.exec(
        "DELETE FROM notification_deliveries; DELETE FROM notification_channels; DELETE FROM incidents; DELETE FROM heartbeats; DELETE FROM monitors; DELETE FROM status_pages; DELETE FROM maintenance_windows;",
      )
    },
  }
}
