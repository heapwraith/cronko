import { z } from "zod"

try {
  process.loadEnvFile("../../.env")
} catch {
  // .env file not found — using process.env as-is (e.g. in CI or tests)
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().min(32),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.email().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  NEXT_PUBLIC_API_URL: z.url().optional(),
  CORS_ORIGINS: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  AUTO_MIGRATE: z
    .enum(["true", "false"])
    .default(process.env.NODE_ENV === "production" ? "false" : "true"),
})

// Docker Compose passes unset optional variables as empty strings
// (e.g. ADMIN_EMAIL=), which optional validators like z.email() reject.
function readEnv(): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""))
}

export const env = (() => {
  try {
    return envSchema.parse(readEnv())
  } catch {
    // Test/CI fallback — inject defaults so downstream modules can read process.env
    process.env.DATABASE_URL ??= "file:./test.db"
    process.env.JWT_SECRET ??= "test-secret-key-minimum-32-characters-long"
    return envSchema.parse(readEnv())
  }
})()
