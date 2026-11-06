# Changelog

All notable changes to Cronko are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0, a minor version may
include breaking changes; they are called out below.

## [Unreleased]

## [0.3.0] - 2026-11-06

Closes the last gaps against Healthchecks: a periodic digest and ping by e-mail.
Upgrading from 0.2 only needs a new image; migration `0016` is applied on boot.

### Added

- Ping by e-mail: an optional SMTP listener (`INBOUND_SMTP_PORT`, `INBOUND_EMAIL_DOMAIN`, optional STARTTLS with `INBOUND_SMTP_TLS_CERT`/`_KEY`). Mail to `<token>@<domain>` is a ping whose output is the sender, subject and text, and `<token>+fail@<domain>` is a failure. Each monitor can also list failure words that mark a message as failed by its subject. Unknown recipients are refused at `RCPT`; the listener never relays, has no login, caps messages at 1 MB and applies the ping rate limit. Monitor pages show the address when the listener is on (migration `0016`).
- Daily or weekly digest (Settings → Periodic digest), off by default. At a chosen hour in the instance timezone (weekly: Mondays) every enabled channel gets one message: current state, monitors that need attention and for how long, runs and failures in the period, new incidents per monitor, and jobs that sent no ping although they were due. PagerDuty skips it. A restart neither repeats nor skips one, turning it on never sends one for a slot that already passed, and after a long downtime only the latest one goes out. "Send one now" queues a digest for the last period to check how it looks. No migration.

### Changed

- `POST /api/settings` now rejects an unknown `timezone`.

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

[Unreleased]: https://github.com/heapwraith/cronko/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/heapwraith/cronko/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/heapwraith/cronko/releases/tag/v0.2.0
