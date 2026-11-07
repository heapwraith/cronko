# Changelog

All notable changes to Cronko are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0, a minor version may
include breaking changes; they are called out below.

## [Unreleased]

## [0.4.0] - 2026-11-06

Adds Prometheus metrics, scoped API tokens, importers, Healthchecks-style ping parity, TOTP
two-factor login, scheduled backups and a JSON configuration export. **Upgrading from 0.3**
needs only a new image: migrations `0017` to `0020` are applied on boot. Logout now revokes the
session on the server, and sessions issued before the upgrade stay valid until they expire.
If you enable 2FA, rotating `JWT_SECRET` invalidates the enrolled secrets (see the README).

### Added

- Ping by slug: `/ping/k/<ping-key>/<slug>` (with `/start`, `/finish`, `/fail`, `/log`, `/<exit>`) using one instance-wide ping key managed in Settings → Ping key (shown on demand, rotatable, constant-time check, never available to API tokens). `?create=1` creates the monitor on its first ping (`timeout`, `grace`; tagged `auto-created`; audit-logged; 20 per hour and 100 in total). Wrong keys are rate limited per address. No migration (stored in settings).
- Ping API parity with Healthchecks: `/ping/:token/log` stores an event (optional body, up to 10 KB) without changing state, schedule, runs or statistics, and `GET /api/monitors/:id/logs` lists them; `/ping/:token/<exit-status>` (0-255) is a success for 0 and a failure otherwise, like `?exit=`; `rid=<uuid>` on `/start` pairs it with the `/finish`, `/fail` or success ping carrying the same id, so concurrent runs are timed correctly (and are not flagged as overlapping). A `rid` that is not a UUID gets `400`; without `rid` nothing changes. Log events are API only for now (no UI). Migration `0018`.
- Generic webhook: optional custom request headers (`Name: value` per line) and an optional body template with `{{event}}`, `{{status}}` (`up`/`down`), `{{message}}`, `{{url}}`, `{{sentAt}}` and `{{monitor.name}}`. Placeholders are plain substitution, never code; unknown ones are rejected when the channel is saved, and values are JSON-escaped unless a non-JSON `Content-Type` header is set. Header values are secrets: the API returns them masked (`****` plus the last four characters) and keeps the stored value when the masked text is sent back. Without either field the payload is the same fixed JSON as before. Same delivery path as before (no new network rules). No migration.
- Configuration export and import: `GET /api/export` returns monitors (no history, no ping tokens), tags, channels, status pages and maintenance windows as JSON. Channel secrets are `[REDACTED]` unless `?includeSecrets=true`, which needs a session (API tokens get `403`); every export is audit-logged. `POST /api/import/cronko` reads that format with `?dryRun=true`, reuses the monitor importer and skips what already exists and channels whose secrets were redacted. No migration.
- Scheduled automatic SQLite backups inside the API process: set `BACKUP_DIR` (unset = off), `BACKUP_INTERVAL_HOURS` (default 24) and `BACKUP_KEEP` (default 7). Uses SQLite's online backup, writes to a temp file, verifies it with `PRAGMA integrity_check` and renames it into place as `cronko-<utc>.db`, then prunes older backups. Failures are logged and never crash the process. Last result (time, size, ok) is in Settings and at `GET /api/settings/backup`. The compose file gains a `cronko_backups` volume at `/app/backups`; files restore with `node scripts/db.mjs restore`. No migration.
- Prometheus metrics: `GET /metrics` in the text exposition format, with per-monitor status (one series per status), last ping time, last run duration and open incidents, plus the open incident total and the notification outbox's pending and failed counts. Off by default (404): set `METRICS_TOKEN` (16+ characters) and scrape with `Authorization: Bearer <token>`. No migration.
- Importers: `POST /api/import/healthchecks` (saved `GET /api/v3/checks/` response, or an API key to fetch it) and `POST /api/import/kuma` (Uptime Kuma backup JSON, push monitors only; other types are reported as skipped). Both take `?dryRun=true`, reuse the monitor validation, skip names that already exist and warn about fields with no equivalent. No migration.
- Scoped API tokens (Settings → API tokens): named, shown once, stored as a SHA-256 hash with a visible prefix, optional expiry and a last-used time. Send as `Authorization: Bearer crk_...` next to the session. `read` allows `GET` only; `write` also manages monitors. A token cannot manage tokens or settings; revoked or expired tokens get `401`, out-of-scope requests `403`. Creating and revoking are in the audit log (`api_token.created`, `api_token.revoked`). Endpoints: `GET/POST /api/settings/tokens`, `DELETE /api/settings/tokens/:id`. Migration `0017`.
- TOTP two-factor authentication (RFC 6238, verified against the RFC vectors, no new server dependency). Settings → Two-factor authentication: QR code rendered in the browser (`qrcode-generator`) or manual key, confirm with a code, 10 single-use recovery codes stored hashed. Login becomes two steps: `POST /auth/login` returns `{ twoFactorRequired, challenge }` and no cookies until `POST /auth/login/2fa` accepts a code or recovery code. Each time step is accepted once, compares are constant-time, and the password and code steps share one failure limit. Disabling needs password and code. Endpoints: `GET /auth/2fa`, `POST /auth/2fa/setup|enable|disable`. API tokens are unaffected and cannot manage 2FA. The secret is encrypted at rest with a key derived from `JWT_SECRET`: rotating `JWT_SECRET` invalidates enrolled secrets. Migration `0020`.

### Security

- Logout now revokes the session on the server. Before, it only cleared the cookies, so a copied refresh token stayed usable for up to 7 days. Access and refresh tokens carry a `jti`; logout adds both to a denylist that `/auth/refresh` and the auth middleware check. Tokens issued before this release have no `jti` and cannot be revoked individually (they expire on their own). Migration `0019`.

### Internal

- A test now fails when `openapi.ts` drifts from the routes the app registers (the missing `GET` variants of `/ping/{token}/start`, `/fail` and `/finish` are now documented). A new CI workflow builds the image for `linux/arm64` under QEMU and probes `/health/live` on pull requests that touch the Dockerfile, dependencies or `packages/database`.

## [0.3.0] - 2026-11-06

Closes the last gaps against Healthchecks: a periodic digest and ping by e-mail.
Upgrading from 0.2 only needs a new image; migration `0016` is applied on boot.

### Added

- Ping by e-mail: an optional SMTP listener (`INBOUND_SMTP_PORT`, `INBOUND_EMAIL_DOMAIN`, optional STARTTLS with `INBOUND_SMTP_TLS_CERT`/`_KEY`). Mail to `<token>@<domain>` is a ping whose output is the sender, subject and text, and `<token>+fail@<domain>` is a failure. Each monitor can also list failure words that mark a message as failed by its subject. Unknown recipients are refused at `RCPT`; the listener never relays, has no login, caps messages at 1 MB and applies the ping rate limit. Monitor pages show the address when the listener is on (migration `0016`).
- Daily or weekly digest (Settings → Periodic digest), off by default. At a chosen hour in the instance timezone (weekly: Mondays) every enabled channel gets one message: current state, monitors that need attention and for how long, runs and failures in the period, new incidents per monitor, and jobs that sent no ping although they were due. PagerDuty skips it. A restart neither repeats nor skips one, turning it on never sends one for a slot that already passed, and after a long downtime only the latest one goes out. "Send one now" queues a digest for the last period to check how it looks. No migration.

### Changed

- `POST /api/settings` now rejects an unknown `timezone`.
- `TELEGRAM_BOT_TOKEN` is gone from the environment and `.env.example`: it was never read (Telegram is set per channel in the UI). Leaving it set is harmless.

### Fixed

- `/finish` without `d` now takes its duration from the open `/start`, as the docs said. Before, the run had no duration and the `/start` stayed open, so the next run could be flagged as overlapping.
- A `/finish` with no open `/start` is kept as a plain run instead of being dropped. A duration is never attached to an earlier plain ping.
- OpenAPI: `d` on `/finish` is in milliseconds (it said seconds). The spec now documents the cron, tags, anomaly and e-mail fields on monitors, maintenance windows, the delivery log and the digest test.
- README, `.env.example` and the in-app guide: the `/start` + `/finish` example, `AUTO_MIGRATE` defaults, `pnpm e2e`, alert events, the monitor form steps, and ping by e-mail.

## [0.2.0] - 2026-11-06

The first published release (image on `ghcr.io/heapwraith/cronko`). It includes
everything listed under 0.1.0, which was prepared but never tagged, plus:

### Added

- Recurring maintenance windows: pick days, a start time, a duration (up to 7 days) and a timezone, for all monitors, one tag or one monitor. While a window runs, alerts are held back; state and incidents are still recorded. Stored as a cron start plus duration, so daylight saving time follows the window's timezone. Managed on the Notifications page; monitors in maintenance get a wrench mark (migration `0015`).
- Public status pages (`/status/<slug>`, no login), one per tag: overall state, each monitor's public state (operational, degraded, problem, paused), 90 days of daily availability (share of each UTC day without an open incident) and the last 30 days of incidents. They expose only those fields, are off until published, and missing and unpublished pages answer the same 404. Managed under "Status" (migration `0014`).
- Tags on monitors: up to 10 per monitor, normalized (lowercase, no accents, `a-z 0-9 . _ -`). Tags show next to each job, the dashboard and monitor list have a tag filter kept in the URL, and `GET /api/monitors?tag=` filters the API (migration `0013`).

## [0.1.0] - 2026-11-06 [not published]

Prepared but never tagged or published; everything below ships in 0.2.0. Cronko is a self-hosted dead man's switch for cron
jobs, backups and ETLs: each job pings a URL when it runs, and Cronko alerts you
when a ping is late, missing or reports a failure.

### Monitoring

- Interval schedules, or cron expressions with a timezone and a preview of the next runs.
- States: pending, healthy, missed (late), down, failed (explicit `/fail` or a non-zero exit code) and paused.
- Ping options: duration (`d`, in ms), exit code (`exit`), `/start` + `/finish` pairs, and job output in the request body (up to 10 KB).
- Optional maximum duration per monitor, with a "slow" alert.
- Incidents opened and resolved automatically, with history.
- Mute a monitor's alerts for 1 hour to 7 days. State and incidents are still tracked while muted.

### Runs and diagnosis

- Run page (`/monitors/:id/runs/:runId`): output shown as a log with error lines highlighted, run facts, previous and next run, and the last successful run's output next to a failed one.
- Run analytics: each run is compared with the up to 100 runs before it (median, p95). Runs much slower than usual and runs that started before the previous one finished are flagged.
- Optional alerts per monitor for those two findings (off by default).
- Duration chart and CSV export.

### Alerts

- Nine channels: Discord, Telegram, e-mail (SMTP), Slack, Microsoft Teams (Workflows), ntfy, Pushover, PagerDuty (Events API v2) and generic webhook.
- Persistent outbox with retry and backoff; a delivery log in the UI shows failed and retried alerts.
- With `PUBLIC_URL` set, alerts link straight to the failing run or monitor.
- Self-monitoring: `SELF_HEARTBEAT_URL` pings an external monitor only while Cronko's database and scheduler are healthy.

### Integrations

- `cronko-run`, a POSIX `sh` + `curl` wrapper served at `/cronko-run`: runs a job, times it, and reports the exit code and output tail.
- Recipes for crontab, systemd timers, Kubernetes CronJobs, GitHub Actions and Docker (`docs/recipes.md`).
- Status badge per monitor, REST API with an OpenAPI spec (`/openapi.json`, docs at `/docs`).

### Web app

- Dark-first interface with a light theme, in Portuguese and English.
- Dashboard sorted by severity, command palette and keyboard shortcuts.
- Accessibility: labelled controls, keyboard navigation, states never shown by colour alone.

### Operations

- Single container (API + web app) on SQLite, with WAL mode and migrations applied on boot.
- Multi-arch image (`linux/amd64`, `linux/arm64`) published to `ghcr.io/heapwraith/cronko`.
- Security: fetch-metadata CSRF protection, strict CSP, rate-limited pings and login, audit log.
- Tests against a real SQLite database, a Playwright end-to-end smoke test, and CI with a Docker smoke test.

[Unreleased]: https://github.com/heapwraith/cronko/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/heapwraith/cronko/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/heapwraith/cronko/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/heapwraith/cronko/releases/tag/v0.2.0
