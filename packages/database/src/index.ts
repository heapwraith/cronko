import { drizzle } from "drizzle-orm/better-sqlite3"
import Database from "better-sqlite3"
import * as schema from "./schema"

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error("DATABASE_URL environment variable is required")
}

if (!url.startsWith("file:")) {
  throw new Error(
    `Unsupported DATABASE_URL "${url}". Cronko uses SQLite only: set DATABASE_URL=file:./data/cronko.db`,
  )
}

const sqlite = new Database(url.slice("file:".length))

// WAL lets readers and the single writer proceed concurrently; busy_timeout
// avoids SQLITE_BUSY under bursts of pings; foreign_keys is off by default in
// SQLite and the schema relies on ON DELETE CASCADE.
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("synchronous = NORMAL")
sqlite.pragma("busy_timeout = 5000")
sqlite.pragma("foreign_keys = ON")

export const sqliteClient: Database.Database = sqlite
export const db = drizzle(sqlite, { schema })

export * from "./schema"
