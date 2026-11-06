# Cronko

Know when your jobs stop running. A self-hosted dead-man's-switch for cron jobs,
backups and ETLs: one container, one SQLite file.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-24-green.svg)](https://nodejs.org)

> **Resumo em português:** o Cronko avisa quando um cron job, backup ou ETL deixa de
> rodar. Cada monitor ganha uma URL de ping; se ela não for chamada no prazo, você é
> alertado (Discord, Telegram, e-mail, Slack, Teams, ntfy, Pushover, PagerDuty, webhook).
> Equipamentos que só mandam e-mail podem pingar por e-mail. Instalação: veja _Quick start_ abaixo
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

Ready-made setups for systemd timers, Kubernetes CronJobs, GitHub Actions and
Docker are in [docs/recipes.md](docs/recipes.md).

Or call the ping URL yourself:

```bash
# crontab: ping only if the backup succeeded
0 2 * * * /usr/local/bin/backup.sh && curl -fsS https://cronko.example.com/ping/TOKEN

# measure duration: /finish is timed from /start; a non-zero exit code alerts immediately
curl -fsS https://cronko.example.com/ping/TOKEN/start
./long-job.sh
curl -fsS "https://cronko.example.com/ping/TOKEN/finish?exit=$?"  # or pass d=<ms> yourself

# or report a failure explicitly, with the job output as the body (up to 10 KB)
./job.sh 2>&1 | tail -c 5000 | curl -fsS --data-binary @- -H 'content-type: text/plain' \
  "https://cronko.example.com/ping/TOKEN/fail?exit=1"
```

Cronko is not an observability platform and does not run active checks
(HTTP/TCP). For uptime of services, use a tool like Uptime Kuma next to it.

## Quick start

```bash
git clone https://github.com/heapwraith/cronko && cd cronko
cp .env.example .env     # set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d     # http://localhost:3000
```

Or run the published image (amd64 and arm64) without cloning:

```bash
docker run -d --name cronko -p 3000:3000 -v cronko_data:/app/data \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='change-me-now' \
  ghcr.io/heapwraith/cronko:0.3
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
- Alerts to Discord, Telegram, e-mail (SMTP), Slack, Microsoft Teams, ntfy, Pushover, PagerDuty and any webhook
- Run analytics: each run is compared with the runs before it (median, p95); runs much slower than usual and runs that started before the previous one finished are flagged, with optional alerts per monitor
- Tags per monitor, with a tag filter on the dashboard and monitor list (`?tag=` in the API)
- Public status pages per tag (`/status/<slug>`, no login): current state, 90 days of daily availability and recent incidents, never tokens or job output
- Recurring maintenance windows (days, start time, duration and timezone) for all monitors, a tag or one monitor: alerts are held back while one runs
- Scoped API tokens (read or write) for scripts and CI, managed in Settings
- Ping by e-mail (`<token>@your-domain`) for devices that can only send mail, with optional failure words per monitor
- Daily or weekly digest to every channel: state, failures, new incidents and jobs that went silent
- Mute a monitor's alerts for maintenance (1 h to 7 days); state and incidents are still tracked
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
| `INBOUND_SMTP_PORT`, `INBOUND_EMAIL_DOMAIN`                     | no       | Ping by e-mail: an SMTP listener on this port accepts mail for `<token>@<domain>` (see below)                                                                     |
| `INBOUND_SMTP_TLS_CERT`, `INBOUND_SMTP_TLS_KEY`                 | no       | PEM files to offer STARTTLS on the e-mail listener                                                                                                                |
| `PUBLIC_URL`                                                    | no       | Public address of this Cronko (e.g. `https://cronko.example.com`); alerts then include a link to the failing run or monitor                                       |
| `AUTO_MIGRATE`                                                  | no       | Apply migrations on boot (default `true`, but `false` when `NODE_ENV=production`; the image sets `true`)                                                          |
| `WEB_DIST`                                                      | no       | Path of the built web app (auto-detected)                                                                                                                         |

Notification channels are configured in the UI: Discord/Slack take a
`webhookUrl`, Telegram a `botToken` and `chatId`, e-mail a recipient `to`.
ntfy takes a `topic` (plus optional `serverUrl` for a self-hosted server and an
access `token`). A generic webhook takes a `url` and receives
`{ "event", "monitor", "message", "sentAt" }` as JSON. Pushover takes a `userKey`
and an `appToken`. Microsoft Teams takes the `webhookUrl` of a Workflows flow
("Post to a channel when a webhook request is received"), since Office 365
connectors are retired. PagerDuty takes the `routingKey` of an Events API v2
integration: problems trigger an incident (one per monitor) and recovery resolves it.

### Ping by e-mail

For devices and software that can only send e-mail (NAS backups, Veeam, routers),
Cronko can receive mail itself. Set `INBOUND_SMTP_PORT` (the image runs as a
non-root user, so use `2525` and publish it as `25:2525`) and
`INBOUND_EMAIL_DOMAIN`, then add an MX record for that domain pointing at the
host. Each monitor page then shows its address:

- `<token>@<domain>`: a success ping. The sender, subject and text become the run output.
- `<token>+fail@<domain>`: a failure.
- Optional per monitor: failure words (e.g. `error, failed`). A subject containing one counts as a failure.

The listener only accepts mail for existing monitors and refuses everything else
at the `RCPT` step. It never relays and has no login. Messages are capped at 1 MB,
and the ping rate limit applies. Some cloud providers block inbound port 25;
check yours before relying on it.

### API tokens

For scripts and CI, create a token in Settings → API tokens (name, scope, optional
expiry). It is shown once; Cronko keeps only its SHA-256 hash and the first
characters to identify it. Send it as `Authorization: Bearer crk_...` on the API:

```sh
curl -H "Authorization: Bearer $CRONKO_TOKEN" https://cronko.example.com/api/monitors
```

- `read`: `GET` requests only.
- `write`: also create, edit, pause and delete monitors (`/api/monitors`). Nothing else.
- A token can never manage tokens or settings. Revoke it in the same screen; an expired
  or revoked token gets `401`, a request outside its scope `403`.
- Creating and revoking tokens is recorded in the audit log, and the list shows when each was last used.

## Security

- Passwords: bcrypt (12 rounds). Sessions: HS256 JWT, 15-minute access token and
  7-day refresh token in `HttpOnly`, `SameSite=Strict` cookies (`Secure` in production).
- CSRF: state-changing requests with a cookie session must be same-origin
  (`Sec-Fetch-Site`, falling back to `Origin`); `Authorization` clients are exempt.
- Login limited to 5 attempts per 15 minutes per IP and e-mail; pings are rate limited per token.
- Public status pages expose only names, states, availability and incident times; never tokens or job output.
- The optional e-mail listener accepts mail only for existing monitors and never relays.
- API tokens are hashed at rest, scoped (`read` or `write` for monitors), revocable and optionally expiring.
- Strict CSP, `X-Frame-Options: DENY`, HSTS in production, no CORS (same origin).
- Report vulnerabilities privately to the maintainer, not in public issues.

## Contributing

Node 24 and pnpm (see `.nvmrc`, `packageManager`). Before a PR:

```bash
pnpm lint        # Biome (lint + format + import order); `pnpm format` fixes
pnpm typecheck
pnpm test        # Vitest; API tests use a real, migrated SQLite
pnpm build
pnpm e2e         # Playwright smoke tests against the built app
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(enforced by lefthook). UI strings live in `packages/shared/src/translations.ts`.
See [docs/ROADMAP.md](docs/ROADMAP.md) for where the project is heading.

## Stack

Hono · Drizzle ORM · SQLite (better-sqlite3) · Vite · React 19 · React Router ·
TanStack Query · Tailwind 4 · Zod 4 · Biome · Vitest · pnpm workspaces.

## License

MIT — see [LICENSE](LICENSE).
