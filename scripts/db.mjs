#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
// Cronko SQLite backup / restore.
//   node scripts/db.mjs backup  [outfile]      (default: backups/cronko-<utc>.db)
//   node scripts/db.mjs restore <backupfile>   (stop the API first)
// Reads DATABASE_URL (file:...) from the environment or .env.
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(resolve(root, "packages/database/package.json"))
const Database = require("better-sqlite3")

function databasePath() {
  let url = process.env.DATABASE_URL
  if (!url && existsSync(resolve(root, ".env"))) {
    const line = readFileSync(resolve(root, ".env"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("DATABASE_URL="))
    url = line?.slice("DATABASE_URL=".length).trim()
  }
  if (!url?.startsWith("file:")) {
    console.error("DATABASE_URL must be a SQLite url (file:...)")
    process.exit(1)
  }
  return resolve(url.slice("file:".length))
}

function check(path) {
  const db = new Database(path, { readonly: true })
  try {
    const result = db.pragma("integrity_check", { simple: true })
    if (result !== "ok") throw new Error(`integrity_check failed: ${result}`)
  } finally {
    db.close()
  }
}

const [command, arg] = process.argv.slice(2)

if (command === "backup") {
  const source = databasePath()
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const out = resolve(arg ?? `backups/cronko-${stamp}.db`)
  mkdirSync(dirname(out), { recursive: true })
  const db = new Database(source, { readonly: true })
  try {
    // Online, consistent snapshot — safe while the API is running.
    await db.backup(out)
  } finally {
    db.close()
  }
  check(out)
  console.log(`Backup complete: ${out}`)
} else if (command === "restore") {
  if (!arg || !existsSync(arg)) {
    console.error("Usage: node scripts/db.mjs restore <backup.db>")
    process.exit(1)
  }
  check(arg)
  const target = databasePath()
  mkdirSync(dirname(target), { recursive: true })
  for (const suffix of ["-wal", "-shm"]) rmSync(target + suffix, { force: true })
  copyFileSync(resolve(arg), target)
  console.log(`Restored ${arg} -> ${target}. Start the API again.`)
} else {
  console.error("Usage: node scripts/db.mjs <backup [outfile] | restore <file>>")
  process.exit(1)
}
