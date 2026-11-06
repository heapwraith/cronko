import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import Database from "better-sqlite3"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

describe("scheduled backup (real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let backup: typeof import("../../services/backup")
  let sqliteClient: Database.Database
  let dir: string

  beforeAll(async () => {
    ctx = await setupTestDb()
    backup = await import("../../services/backup")
    sqliteClient = (await import("@cronko/database")).sqliteClient
  })
  beforeEach(() => {
    ctx.reset()
    backup.resetBackupState()
    dir = mkdtempSync(join(tmpdir(), "cronko-backups-"))
  })
  afterAll(() => backup.resetBackupState())

  const files = () => readdirSync(dir).sort()
  const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n))

  it("writes a consistent, restorable copy and reports it", async () => {
    sqliteClient
      .prepare("INSERT INTO settings (key, value) VALUES ('instanceName', 'backed-up')")
      .run()
    const status = await backup.runBackup(dir, 7, sqliteClient, at(0))

    expect(status).toMatchObject({ ok: true, error: null })
    expect(status.sizeBytes).toBeGreaterThan(0)
    expect(files()).toEqual([status.file])
    expect(backup.getBackupStatus()).toEqual(status)

    const copy = new Database(join(dir, status.file as string), { readonly: true })
    expect(copy.pragma("integrity_check", { simple: true })).toBe("ok")
    expect(copy.prepare("SELECT value FROM settings WHERE key='instanceName'").get()).toEqual({
      value: "backed-up",
    })
    copy.close()
  })

  it("leaves no temp file behind and keeps only the newest N", async () => {
    for (let i = 0; i < 5; i++) await backup.runBackup(dir, 3, sqliteClient, at(i))
    const names = files()
    expect(names).toHaveLength(3)
    expect(names.every((f) => /^cronko-.*\.db$/.test(f))).toBe(true)
    expect(names.at(-1)).toContain("2026-01-01T00-00-04")
    expect(names[0]).toContain("2026-01-01T00-00-02")
  })

  it("never prunes files that are not backups", async () => {
    writeFileSync(join(dir, "notes.txt"), "keep me")
    for (let i = 0; i < 3; i++) await backup.runBackup(dir, 1, sqliteClient, at(i))
    expect(files()).toContain("notes.txt")
    expect(files().filter((f) => f.endsWith(".db"))).toHaveLength(1)
  })

  it("a failing backup is reported, not thrown, and keeps earlier ones", async () => {
    const ok = await backup.runBackup(dir, 7, sqliteClient, at(0))
    const broken = {
      backup: () => Promise.reject(new Error("disk full")),
    } as unknown as Database.Database
    const status = await backup.runBackup(dir, 7, broken, at(1))

    expect(status.ok).toBe(false)
    expect(status.error).toContain("disk full")
    expect(status.file).toBe(ok.file)
    expect(files()).toEqual([ok.file])
  })

  it("an unwritable directory fails softly", async () => {
    const blocker = join(dir, "file")
    writeFileSync(blocker, "x")
    const status = await backup.runBackup(join(blocker, "sub"), 7, sqliteClient, at(0))
    expect(status.ok).toBe(false)
  })

  it("rejects a corrupt copy and does not publish it", async () => {
    const corrupt = {
      backup: async (path: string) => {
        writeFileSync(path, "not a database at all, just text".repeat(100))
      },
    } as unknown as Database.Database
    const status = await backup.runBackup(dir, 7, corrupt, at(0))
    expect(status.ok).toBe(false)
    expect(files()).toEqual([])
  })

  it("scripts/db.mjs restore accepts a scheduled backup", async () => {
    sqliteClient.prepare("INSERT INTO settings (key, value) VALUES ('k', 'v')").run()
    const { file } = await backup.runBackup(dir, 7, sqliteClient, at(0))
    const target = join(mkdtempSync(join(tmpdir(), "cronko-restore-")), "restored.db")
    const script = resolve(__dirname, "../../../../../scripts/db.mjs")
    execFileSync("node", [script, "restore", join(dir, file as string)], {
      env: { ...process.env, DATABASE_URL: `file:${target}` },
    })
    expect(existsSync(target)).toBe(true)
    const restored = new Database(target, { readonly: true })
    expect(restored.prepare("SELECT value FROM settings WHERE key='k'").get()).toEqual({
      value: "v",
    })
    restored.close()
  })
})
