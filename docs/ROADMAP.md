# Cronko roadmap

Cronko is a **self-hosted monitor for cron jobs, backups and ETLs**. It does not
run active checks (HTTP/TCP); that is Uptime Kuma's ground. The real benchmark is
**Healthchecks.io** (also open source, mature, free tier of 20 checks), so parity
with it is the entry ticket and the differentiators below are the reason to switch.

## Where Cronko stands (2026-11)

| Capability                                         | Cronko            | Healthchecks.io | Uptime Kuma              |
| -------------------------------------------------- | ----------------- | --------------- | ------------------------ |
| Ping URL, grace period, incidents, recovery alerts | yes               | yes             | partial ("push" monitor) |
| Start / finish events, duration, exit code         | yes               | yes             | no                       |
| Max-duration alert                                 | yes               | partial         | no                       |
| Cron expression + timezone schedule                | yes               | yes             | no                       |
| Explicit `/fail` signal                            | yes               | yes             | no                       |
| Ping by e-mail                                     | yes               | yes             | no                       |
| Per-check event log with output                    | yes               | yes             | partial                  |
| Notification channels                              | 9                 | many            | many                     |
| Public status pages                                | yes (per tag)     | badges          | yes                      |
| Active HTTP/TCP checks                             | no (out of scope) | no              | yes                      |
| Single container, one SQLite file                  | yes               | no              | yes                      |

Healthchecks/Cronitor columns come from Healthchecks' own comparison page; the
Uptime Kuma column is general knowledge and was not re-verified. Re-check before
making product claims.

## Done

- Single process: Vite SPA served by the API, same origin, one container.
- SQLite-only (the old Postgres path never worked); WAL, indexes, migrations in Docker.
- Atomic monitor state machine: no duplicate alerts, recovery alerts now sent.
- Fetch-metadata CSRF, strict CSP, trustworthy client IP, no CORS.
- Tests against a real migrated SQLite; Biome; CI with a Docker smoke test.
- Notification outbox with retry/backoff and a delivery log API.
- `/fail` signal and a distinct `failed` state with an immediate alert.
- Cron-expression + timezone schedules with next-expected-run preview (API and unified monitor form).
- Monitor detail redesigned around diagnosis.

## P0 - reliability (a lost alert is fatal)

1. ~~Notification delivery: retry with backoff, per-attempt log, visible failures in the UI.~~ Done.
2. ~~"Monitor the monitor": optional outbound heartbeat.~~ Done (`SELF_HEARTBEAT_URL`).
3. ~~Tests for the notifier and the routes, and an e2e smoke.~~ Done (`pnpm e2e`, also in CI).
4. Verify the Docker image on a real amd64 and arm64 host. CI builds and boots it on amd64 only; the release workflow builds both.
5. ~~Accessibility pass on the legacy UI.~~ Done; the a11y lint rules are errors.

## P1 - parity with Healthchecks

1. ~~Cron expression + timezone schedules, with next-expected-run.~~ Done.
2. ~~Per-check event log with captured output (size-limited).~~ Done (run page, 10 KB output).
3. More channels: generic webhook, ntfy, Pushover, Teams and PagerDuty are done.
4. ~~Ping by e-mail~~ done (built-in SMTP listener, `+fail` address, failure words per monitor); mute per check is done (1 h to 7 days, state and incidents still tracked).

## P2 - differentiators

1. Done: `cronko-run <ping-url> -- <cmd>` wrapper (POSIX sh + curl, served at
   `/cronko-run`; duration, exit code, output tail) and recipes for crontab,
   systemd, Kubernetes CronJob, GitHub Actions and Docker in `docs/recipes.md`.
2. Run analytics: done for display (p50/p95 baseline per run, "much slower than usual"
   flag, overlapping /start runs), with opt-in alerts per monitor (off by default;
   PagerDuty skips them).
3. ~~Public status page per group with SLA and incident history.~~ Done: one page per tag, 90-day daily availability, 30-day incidents, off until published.
4. Tags are done (up to 10 per monitor, filter in the UI and `?tag=` in the API). Recurring maintenance windows are done. The daily/weekly digest is done (off by default, PagerDuty skips it).

## P3 - reach

- Teams and roles, scoped API tokens, importers (Healthchecks, Kuma).
- Prometheus metrics.
- ~~Semantic versioning and a changelog.~~ Done from 0.1.0 (`CHANGELOG.md`).

## Non-goals

Active HTTP/TCP/DNS checks as a focus. Document coexistence instead:
Uptime Kuma for services, Cronko for jobs.
