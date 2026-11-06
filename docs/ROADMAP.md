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
| Per-check event log with output                    | basic             | yes             | partial                  |
| Notification channels                              | 6                 | many            | many                     |
| Public status pages                                | badge only        | badges          | yes                      |
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

1. Notification delivery: retry with backoff, per-attempt log, visible failures in the UI.
2. ~~"Monitor the monitor": optional outbound heartbeat.~~ Done (`SELF_HEARTBEAT_URL`).
3. Tests for the notifier and the routes are done, and so is the e2e smoke (`pnpm e2e`, Playwright: login → monitor → failing ping → run page), which also runs in CI.
4. Verify the Docker image on amd64 and arm64 (CI builds it; not yet run on a real host).
5. Accessibility pass on the legacy UI (labels, button types, keyboard handlers); the lint rules are warnings today.

## P1 - parity with Healthchecks

1. ~~Cron expression + timezone schedules, with next-expected-run.~~ Done.
2. Per-check event log with captured output (size-limited).
3. More channels: generic webhook and ntfy are done; Pushover, PagerDuty, Teams remain.
4. Ping by e-mail; mute per check.

## P2 - differentiators

1. Done: `cronko-run <ping-url> -- <cmd>` wrapper (POSIX sh + curl, served at
   `/cronko-run`; duration, exit code, output tail). Remaining: ready-made snippets
   for systemd, Kubernetes CronJob and GitHub Actions.
2. Run analytics: p50/p95 duration, slow/anomalous run detection, overlapping runs.
3. Public status page per group with SLA and incident history.
4. Tags/groups, maintenance windows, daily/weekly digest.

## P3 - reach

- Teams and roles, scoped API tokens, importers (Healthchecks, Kuma).
- Prometheus metrics; semantic versioning and a changelog (everything is `0.0.0`).

## Non-goals

Active HTTP/TCP/DNS checks as a focus. Document coexistence instead:
Uptime Kuma for services, Cronko for jobs.
