import "./load-env"
import { z } from "zod"

const envSchema = z
  .object({
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
    // Ping by e-mail: an SMTP listener that turns mail to <token>@INBOUND_EMAIL_DOMAIN
    // into pings. Off unless a port is set; point the domain's MX record here.
    INBOUND_SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    INBOUND_SMTP_HOST: z.string().default("0.0.0.0"),
    INBOUND_EMAIL_DOMAIN: z
      .string()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "a domain name such as ping.example.com")
      .optional(),
    // Optional PEM files to offer STARTTLS.
    INBOUND_SMTP_TLS_CERT: z.string().optional(),
    INBOUND_SMTP_TLS_KEY: z.string().optional(),
    // Optional outbound dead-man's switch: Cronko pings this URL while it is healthy,
    // so an external monitor alerts you when Cronko itself stops.
    SELF_HEARTBEAT_URL: z.url().optional(),
    // Public address of this Cronko (e.g. https://cronko.example.com). When set, alerts
    // carry a link straight to the failing run or monitor.
    PUBLIC_URL: z.url().optional(),
    SELF_HEARTBEAT_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(300),
    // Bearer token that enables GET /metrics (Prometheus). Unset = the endpoint is off (404).
    METRICS_TOKEN: z.string().min(16).optional(),
    // Scheduled SQLite backups. Unset BACKUP_DIR = off.
    BACKUP_DIR: z.string().optional(),
    BACKUP_INTERVAL_HOURS: z.coerce.number().min(0.01).default(24),
    BACKUP_KEEP: z.coerce.number().int().min(1).default(7),
    // Single sign-on, both off by default. Only users that already exist can sign in.
    // OIDC (authorization code + PKCE). OIDC_REDIRECT_URL defaults to PUBLIC_URL + the callback path.
    OIDC_ISSUER: z.url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_REDIRECT_URL: z.url().optional(),
    // Trusted-proxy login (Authelia, Authentik, oauth2-proxy...): the header is honoured only
    // when the TCP peer is inside TRUSTED_PROXY_IPS (comma-separated IPs or CIDRs).
    TRUSTED_PROXY_AUTH_HEADER: z
      .string()
      .regex(/^[A-Za-z0-9-]+$/)
      .optional(),
    TRUSTED_PROXY_IPS: z.string().optional(),
    // Turn the password form off when SSO is the only way in.
    PASSWORD_LOGIN_DISABLED: z.enum(["true", "false"]).default("false"),
    // Extra origins allowed to make state-changing requests (reverse proxy / custom domain)
    // Honour X-Forwarded-For / X-Real-IP (only behind a reverse proxy you control)
    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    TRUSTED_ORIGINS: z.string().optional(),
    // Directory with the built web app (apps/web/dist). Auto-detected when unset.
    WEB_DIST: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    AUTO_MIGRATE: z
      .enum(["true", "false"])
      .default(process.env.NODE_ENV === "production" ? "false" : "true"),
  })
  .refine((e) => !e.INBOUND_SMTP_PORT || e.INBOUND_EMAIL_DOMAIN, {
    message: "INBOUND_EMAIL_DOMAIN is required when INBOUND_SMTP_PORT is set",
    path: ["INBOUND_EMAIL_DOMAIN"],
  })
  .refine(
    (e) =>
      [e.OIDC_ISSUER, e.OIDC_CLIENT_ID, e.OIDC_CLIENT_SECRET].every(Boolean) ||
      [e.OIDC_ISSUER, e.OIDC_CLIENT_ID, e.OIDC_CLIENT_SECRET].every((v) => !v),
    {
      message: "set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET together, or none",
      path: ["OIDC_ISSUER"],
    },
  )
  .refine((e) => !e.OIDC_ISSUER || e.OIDC_REDIRECT_URL || e.PUBLIC_URL, {
    message:
      "OIDC needs OIDC_REDIRECT_URL or PUBLIC_URL (the callback is PUBLIC_URL/auth/sso/oidc/callback)",
    path: ["OIDC_REDIRECT_URL"],
  })
  .refine((e) => !e.TRUSTED_PROXY_AUTH_HEADER === !e.TRUSTED_PROXY_IPS, {
    message: "set both TRUSTED_PROXY_AUTH_HEADER and TRUSTED_PROXY_IPS, or neither",
    path: ["TRUSTED_PROXY_IPS"],
  })
  .refine(
    (e) => e.PASSWORD_LOGIN_DISABLED === "false" || e.OIDC_ISSUER || e.TRUSTED_PROXY_AUTH_HEADER,
    {
      message:
        "PASSWORD_LOGIN_DISABLED=true needs OIDC or trusted-proxy login, or nobody could sign in",
      path: ["PASSWORD_LOGIN_DISABLED"],
    },
  )
  .refine((e) => !e.INBOUND_SMTP_TLS_CERT === !e.INBOUND_SMTP_TLS_KEY, {
    message: "set both INBOUND_SMTP_TLS_CERT and INBOUND_SMTP_TLS_KEY, or neither",
    path: ["INBOUND_SMTP_TLS_KEY"],
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
