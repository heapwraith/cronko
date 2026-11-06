// Loads the repo-root .env into process.env as a side effect.
//
// It must be the FIRST import of the entry point: workspace packages such as
// @cronko/database read DATABASE_URL while they are being imported, which is
// before env.ts could run. (A formatter that sorts imports must not reorder it.)
try {
  process.loadEnvFile("../../.env")
} catch {
  // No .env file: use process.env as-is (Docker, CI, tests).
}
