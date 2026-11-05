# Cronko

Know when your jobs stop running.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-24-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9-orange.svg)](https://pnpm.io)

[Leia em português](README.pt-BR.md)

```
$ docker compose up
✔ db        Started
✔ api       Started  (http://localhost:3001)
✔ web       Started  (http://localhost:3000)
```

---

## What it is

Cronko monitors cron jobs, backup scripts, ETL pipelines, and any scheduled
automation that can fire an HTTP request. You configure a monitor with an
expected interval, receive a ping URL, and the system alerts you when a job
misses its window.

It is not an observability platform. It does not collect metrics, parse logs,
or do distributed tracing. If you need Datadog, this is not it. Cronko does
one thing: it tells you when your jobs stop running.

## How it works

Each monitor gets a unique ping URL. Your cron job hits that URL when it runs.
The scheduler checks every few seconds whether each monitor received a heartbeat
within its expected window. Late heartbeats trigger a miss, prolonged absence
triggers a down status, and recovery resets everything. Incidents are tracked
with start/end timestamps. Notifications fire on every state transition through
Discord, Telegram, Email, or Slack.

```bash
# in your crontab
0 2 * * * /usr/local/bin/backup.sh && \
  curl -s https://cronko.example.com/ping/your-token > /dev/null
```

## Features

- Heartbeat monitoring for cron jobs, scripts, ETLs
- Status detection: pending → healthy → missed → down → recovered
- Configurable grace periods before marking as missed
- Incident tracking with timestamps for every status transition
- Pulse (start/finish) for precise duration measurement of long-running jobs
- Max duration alerts when jobs exceed configured limits
- Notifications via Discord, Telegram, Email, Slack
- Public SVG status badge (`/badge/:token`) without authentication
- Dashboard with donut chart, sparklines, animated counters, 24h uptime
- Automatic heartbeat cleanup (configurable retention)
- Dark / Light / System theme with animated View Transition API
- Compact mode for smaller screens
- CSV export for heartbeat data
- i18n: English and Portuguese (Brazil)
- SQLite for development, PostgreSQL for production
- Redis for distributed rate limiting (optional)
- Docker and local dev support
- Health probes: `/health`, `/health/live`, `/health/ready`
- Scheduler metrics: `/health/metrics`
- Audit logging for all critical actions
- Database backup and restore scripts
- Refresh token rotation with automatic renewal

## Installation

### Docker

```bash
git clone https://github.com/wesllen-lima/cronko
cd cronko
cp .env.example .env
# edit .env — set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d
```

Open `http://localhost:3000` and log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

### Local development

```bash
pnpm install
cp .env.example .env
# DATABASE_URL defaults to SQLite — no additional setup needed
pnpm dev
```

API runs on `:3001`, web on `:3000`.

## Environment variables

| Variable              | Required | Description                                                     |
| --------------------- | -------- | --------------------------------------------------------------- |
| `DATABASE_URL`        | Yes      | `file:./data/cronko.db` (SQLite) or `postgresql://...`          |
| `API_PORT`            | No       | API server port (default: 3001)                                 |
| `API_HOST`            | No       | API bind address (default: 0.0.0.0)                             |
| `NEXT_PUBLIC_API_URL` | No       | URL the frontend uses to reach the API                          |
| `JWT_SECRET`          | Yes      | Key for signing JWT tokens (min 32 chars)                       |
| `ADMIN_EMAIL`         | No       | Auto-created admin user email on first boot                     |
| `ADMIN_PASSWORD`      | No       | Auto-created admin user password (min 8 chars)                  |
| `SMTP_HOST`           | No       | SMTP server for email notifications                             |
| `SMTP_PORT`           | No       | SMTP port (default: 587)                                        |
| `SMTP_USER`           | No       | SMTP username                                                   |
| `SMTP_PASS`           | No       | SMTP password                                                   |
| `SMTP_FROM`           | No       | From address for notification emails                            |
| `TELEGRAM_BOT_TOKEN`  | No       | Bot token for Telegram notifications                            |
| `CORS_ORIGINS`        | No       | Additional CORS origins, comma-separated                        |
| `REDIS_URL`           | No       | Redis URL for distributed rate limiting                         |
| `NODE_ENV`            | No       | `development`, `production`, or `test` (default: `development`) |

## Notification integrations

### Discord

Create a webhook in your Discord server settings. Add a channel in Cronko with
type `discord` and paste the webhook URL.

```json
{ "webhookUrl": "https://discord.com/api/webhooks/..." }
```

### Telegram

Create a bot via `@BotFather`, get the token, find your chat ID. Add a channel
with type `telegram`.

```json
{ "botToken": "123456:ABC-DEF...", "chatId": "-1001234567890" }
```

### Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in
`.env`. Add a channel with type `email` and the recipient address.

```json
{ "to": "alerts@example.com" }
```

### Slack

Create a Slack webhook. Add a channel with type `slack` and paste the webhook URL.

```json
{ "webhookUrl": "https://hooks.slack.com/services/..." }
```

## Advanced features

### Pulse (start/finish)

For long-running jobs, use `/start` before starting and `/finish` when done.
Duration is calculated automatically.

```bash
curl -X POST https://cronko.example.com/ping/TOKEN/start
./my-long-job.sh
curl -X POST "https://cronko.example.com/ping/TOKEN/finish?d=$SECONDS&exit=$?"
```

### Public status badge

Display your monitor's status anywhere with a public SVG badge.

```markdown
![Cronko](https://cronko.example.com/badge/TOKEN)
```

### Max duration

Set a max duration limit when creating a monitor. If a ping reports a duration
above this limit, an incident is automatically generated.

### Heartbeat cleanup

Heartbeats older than 90 days are automatically removed (configurable in
Settings).

### CSV export

Export any monitor's heartbeats as CSV:
`/api/monitors/:id/heartbeats?format=csv`

## Stack

- Backend: Hono, Node.js, Drizzle ORM, SQLite / PostgreSQL
- Frontend: Next.js, React, Tailwind CSS
- Infra: Docker, pnpm workspaces, Turborepo

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and code style guidelines.

Before opening a PR, ensure `pnpm typecheck` passes across all workspaces.
Report bugs using the issue templates and review our
[Security Policy](SECURITY.md) for vulnerability disclosures.

## License

MIT — see [LICENSE](LICENSE) for details.
