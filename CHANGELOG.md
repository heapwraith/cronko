# Changelog

All notable changes to Cronko are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0, a minor version may
include breaking changes; they are called out below.

## [Unreleased]

## [0.1.0] - 2026-11-06

The first tagged release. Cronko is a self-hosted dead man's switch for cron
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

[Unreleased]: https://github.com/heapwraith/cronko/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/heapwraith/cronko/releases/tag/v0.1.0
