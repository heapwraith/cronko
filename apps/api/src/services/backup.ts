import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { sqliteClient } from "@cronko/database"
import Database from "better-sqlite3"
import { logger } from "../lib/logger"

/**
 * Scheduled SQLite backups. Uses better-sqlite3's online backup API, so the
 * snapshot is consistent while the API keeps serving. The file is written next
 * to its final name and renamed only after PRAGMA integrity_check passes, so a
 * crash never leaves a truncated `cronko-*.db`. Files are named like the ones
 * `node scripts/db.mjs backup` produces and restore with `scripts/db.mjs restore`.
 */

export type BackupStatus = {
  /** ISO time of the last attempt, success or not. */
  at: string
  ok: boolean
  /** File name (not the full path) of the last successful backup. */
  file: string | null
  sizeBytes: number | null
  error: string | null
}

export type BackupOptions = {
  dir: string
  intervalHours: number
  keep: number
}

const FILE_PATTERN = /^cronko-.+\.db$/

let last: BackupStatus | null = null
let timer: NodeJS.Timeout | null = null
let running = false

export const getBackupStatus = (): BackupStatus | null => last
export const backupEnabled = (): boolean => timer !== null

/** Test hook. */
export function resetBackupState() {
  last = null
  stopBackups()
}

function listBackups(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => FILE_PATTERN.test(f))
      .sort()
  } catch {
    return []
  }
}

/** Removes everything but the newest `keep` backups. Names sort chronologically. */
export function pruneBackups(dir: string, keep: number): string[] {
  const removed = listBackups(dir).slice(0, Math.max(0, listBackups(dir).length - keep))
  for (const f of removed) rmSync(join(dir, f), { force: true })
  return removed
}

function verify(path: string) {
  // The copy inherits WAL mode; switch it to a single self-contained file so no
  // -wal/-shm sidecars are created (and orphaned by the rename).
  const db = new Database(path)
  try {
    db.pragma("journal_mode = DELETE")
    const result = db.pragma("integrity_check", { simple: true })
    if (result !== "ok") throw new Error(`integrity_check failed: ${String(result)}`)
  } finally {
    db.close()
  }
}

/** One backup run. Never throws: the outcome is logged and kept in `getBackupStatus()`. */
export async function runBackup(
  dir: string,
  keep: number,
  source: Database.Database = sqliteClient,
  now: Date = new Date(),
): Promise<BackupStatus> {
  if (running)
    return (
      last ?? {
        at: now.toISOString(),
        ok: false,
        file: null,
        sizeBytes: null,
        error: "already running",
      }
    )
  running = true
  const stamp = now.toISOString().replace(/[:.]/g, "-")
  const name = `cronko-${stamp}.db`
  const tmp = join(dir, `.${name}.tmp`)
  try {
    mkdirSync(dir, { recursive: true })
    await source.backup(tmp)
    verify(tmp)
    renameSync(tmp, join(dir, name))
    const pruned = pruneBackups(dir, keep)
    last = {
      at: now.toISOString(),
      ok: true,
      file: name,
      sizeBytes: statSync(join(dir, name)).size,
      error: null,
    }
    logger.info({ file: name, sizeBytes: last.sizeBytes, pruned: pruned.length }, "backup complete")
  } catch (err) {
    try {
      rmSync(tmp, { force: true })
    } catch {
      // best effort
    }
    const message = err instanceof Error ? err.message : String(err)
    last = {
      at: now.toISOString(),
      ok: false,
      file: last?.file ?? null,
      sizeBytes: last?.sizeBytes ?? null,
      error: message,
    }
    logger.error({ err, dir }, "backup failed")
  } finally {
    running = false
  }
  return last
}

/** Reads the newest backup on disk so the status survives a restart. */
function statusFromDisk(dir: string): BackupStatus | null {
  const file = listBackups(dir).at(-1)
  if (!file) return null
  try {
    const st = statSync(join(dir, file))
    return { at: st.mtime.toISOString(), ok: true, file, sizeBytes: st.size, error: null }
  } catch {
    return null
  }
}

export function startBackups(opts: BackupOptions) {
  stopBackups()
  const dir = resolve(opts.dir)
  const intervalMs = Math.max(60_000, opts.intervalHours * 3_600_000)
  last = statusFromDisk(dir)
  // Don't back up on every restart: wait out what is left of the interval.
  const age = last ? Date.now() - new Date(last.at).getTime() : Number.POSITIVE_INFINITY
  const firstDelay = Math.max(10_000, intervalMs - age)

  const tick = () => {
    void runBackup(dir, opts.keep)
  }
  const first = setTimeout(() => {
    tick()
    timer = setInterval(tick, intervalMs)
    timer.unref()
  }, firstDelay)
  first.unref()
  // Track the pending first run through `timer` so stopBackups() cancels either phase.
  timer = first as unknown as NodeJS.Timeout
  logger.info({ dir, intervalHours: opts.intervalHours, keep: opts.keep }, "scheduled backups on")
}

export function stopBackups() {
  if (timer) {
    clearTimeout(timer)
    clearInterval(timer)
    timer = null
  }
}
