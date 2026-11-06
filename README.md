# Cronko

Know when your jobs stop running. A self-hosted dead-man's-switch for cron jobs,
backups and ETLs: one container, one SQLite file.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-24-green.svg)](https://nodejs.org)

> **Resumo em português:** o Cronko avisa quando um cron job, backup ou ETL deixa de
> rodar. Cada monitor ganha uma URL de ping; se ela não for chamada no prazo, você é
> alertado (Discord, Telegram, e-mail, Slack, ntfy, webhook). Instalação: veja _Quick start_ abaixo
> (`docker compose up -d`) e abra `http://localhost:3000`. A interface tem pt-BR e en.

## How it works

Each monitor has a unique ping URL. Your job calls it when it runs. If no ping
arrives within _interval + grace_, the monitor becomes **missed**; if it stays
silent for another interval it becomes **down**. A ping brings it back to
**healthy**, closes the incident and sends a recovery alert.

The easiest way is the `cronko-run` wrapper, served by your Cronko instance. It
runs the job, times it, sends the exit code and the last 10 KB of output, and
exits with the job's own code. It needs only `sh` and `curl`:

```bash
sudo curl -fsSL https://cronko.example.com/cronko-run -o /usr/local/bin/cronko-run
sudo chmod +x /usr/local/bin/cronko-run

# crontab
0 2 * * * cronko-run https://cronko.example.com/ping/TOKEN -- /usr/local/bin/backup.sh
```

Or call the ping URL yourself:

```bash
# crontab: ping only if the backup succeeded
0 2 * * * /usr/local/bin/backup.sh && curl -fsS https://cronko.example.com/ping/TOKEN

# measure duration; a non-zero exit code alerts immediately
curl -fsS https://cronko.example.com/ping/TOKEN/start
./long-job.sh; code=$?
curl -fsS "https://cronko.example.com/ping/TOKEN/finish?d=$SECONDS&exit=$code"

# or report a failure explicitly, with the job output as the body (up to 10 KB)
./job.sh 2>&1 | tail -c 5000 | curl -fsS --data-binary @- -H 'content-type: text/plain' \
  "https://cronko.example.com/ping/TOKEN/fail?exit=1"
```

Cronko is not an observability platform and does not run active checks
(HTTP/TCP). For uptime of services, use a tool like Uptime Kuma next to it.

## Quick start

```bash
git clone https://github.com/wesllen-lima/cronko && cd cronko
cp .env.example .env     # set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d     # http://localhost:3000
```

Data lives in the `cronko_data` volume (`/app/data/cronko.db`). Behind a reverse
proxy, set `TRUST_PROXY=true` and `TRUSTED_ORIGINS=https://your.domain`.

### Development

```bash
pnpm install
cp .env.example .env
pnpm --filter @cronko/api dev     # API on :3001
pnpm --filter @cronko/web dev     # web on :3000, proxies the API
```

## Features

- Heartbeat monitoring with grace periods and a missed → down → recovered lifecycle
- Pulse (`/start` + `/finish`) with duration, exit code and optional output
- Explicit `/fail` signal and non-zero exit codes: a distinct `failed` state with an immediate alert
- Max-duration alerts, incident history, audit log
- Alerts to Discord, Telegram, e-mail (SMTP), Slack, ntfy and any webhook
- Public SVG status badge (`/badge/:token`), CSV export of heartbeats
- Dashboard, dark/light theme, English and pt-BR, installable PWA
- OpenAPI docs at `/docs`; health probes at `/health/live` and `/health/ready`
- Online backup and restore (`node scripts/db.mjs backup|restore`)

## Configuration

| Variable                                                        | Required | Description                                                                                                                                                       |
| --------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                                    | yes      | Signing key, at least 32 characters                                                                                                                               |
| `DATABASE_URL`                                                  | yes      | SQLite file, e.g. `file:./data/cronko.db` (set in the image)                                                                                                      |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`                                 | no       | Admin account created on first boot                                                                                                                               |
| `API_PORT`, `API_HOST`                                          | no       | Default `3001` / `0.0.0.0` (the image uses `3000`)                                                                                                                |
| `TRUST_PROXY`                                                   | no       | `true` to trust `X-Forwarded-For` / `X-Real-IP` (only behind your proxy)                                                                                          |
| `TRUSTED_ORIGINS`                                               | no       | Extra public origins allowed to make changes, comma-separated                                                                                                     |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | no       | E-mail alerts                                                                                                                                                     |
| `SELF_HEARTBEAT_URL`, `SELF_HEARTBEAT_INTERVAL_SECONDS`         | no       | Monitor the monitor: Cronko pings this URL (default every 300 s) only while its database and scheduler are healthy; point it at another Cronko or Healthchecks.io |
| `PUBLIC_URL`                                                    | no       | Public address of this Cronko (e.g. `https://cronko.example.com`); alerts then include a link to the failing run or monitor                                       |
| `AUTO_MIGRATE`                                                  | no       | Apply migrations on boot (default `true`)                                                                                                                         |
| `WEB_DIST`                                                      | no       | Path of the built web app (auto-detected)                                                                                                                         |

Notification channels are configured in the UI: Discord/Slack take a
`webhookUrl`, Telegram a `botToken` and `chatId`, e-mail a recipient `to`.
ntfy takes a `topic` (plus optional `serverUrl` for a self-hosted server and an
access `token`). A generic webhook takes a `url` and receives
`{ "event", "monitor", "message", "sentAt" }` as JSON.

## Security

- Passwords: bcrypt (12 rounds). Sessions: HS256 JWT, 15-minute access token and
  7-day refresh token in `HttpOnly`, `SameSite=Strict` cookies (`Secure` in production).
- CSRF: state-changing requests with a cookie session must be same-origin
  (`Sec-Fetch-Site`, falling back to `Origin`); `Authorization` clients are exempt.
- Login limited to 5 attempts per 15 minutes per IP and e-mail; pings are rate limited per token.
- Strict CSP, `X-Frame-Options: DENY`, HSTS in production, no CORS (same origin).
- Report vulnerabilities privately to the maintainer, not in public issues.

## Contributing

Node 24 and pnpm (see `.nvmrc`, `packageManager`). Before a PR:

```bash
pnpm lint        # Biome (lint + format + import order); `pnpm format` fixes
pnpm typecheck
pnpm test        # Vitest; API tests use a real, migrated SQLite
pnpm build
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(enforced by lefthook). UI strings live in `packages/shared/src/translations.ts`.
See [docs/ROADMAP.md](docs/ROADMAP.md) for where the project is heading.

## Stack

Hono · Drizzle ORM · SQLite (better-sqlite3) · Vite · React 19 · React Router ·
TanStack Query · Tailwind 4 · Zod 4 · Biome · Vitest · pnpm workspaces.

## License

MIT — see [LICENSE](LICENSE).
