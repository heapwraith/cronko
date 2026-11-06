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

- Teams and roles. ~~Scoped API tokens.~~ Done: `read`/`write` tokens, hashed, optional expiry, managed in Settings. ~~Importers (Healthchecks, Kuma).~~ Done: `POST /api/import/healthchecks` and `/api/import/kuma`, with dry run (see README).
- ~~Prometheus metrics.~~ Done: opt-in `GET /metrics` behind `METRICS_TOKEN`.
- ~~Semantic versioning and a changelog.~~ Done from 0.1.0 (`CHANGELOG.md`).

## Next up (gap research, 2026-11-06)

Compared against the Healthchecks docs (Pinging API, Management API, badges, notifications, changelog)
and Cronitor's integrations page. Better Stack, Sentry Crons, Dead Man's Snitch and Uptime Kuma were
not verified in depth, so claims about them are unconfirmed. In order of value over effort:

1. Ping API parity: `/log`, `/<exit-status>` in the path, and `rid=<uuid>` to pair concurrent start/finish runs.
2. Generic webhook with a custom template and headers (covers many missing channels at once).
3. Cheap channels: Google Chat, Mattermost/Rocket.Chat, Gotify, Matrix, Opsgenie.
4. ~~2FA (TOTP, later WebAuthn): the UI is internet-facing and holds ping tokens.~~ TOTP done (Settings, recovery codes, login code step; see README). WebAuthn is still open.
5. Scheduled automatic SQLite backup and a JSON export of monitors and channels.
6. Ping by slug with a project key and `?create=1` (provisioning from CI/IaC).
7. Badges per tag, JSON/Shields.io formats, three states.
8. Apprise integration (one URL covers dozens of services).
9. Proxy-header login and/or OIDC for self-hosters with SSO.
10. Official GitHub Action and a clean OpenAPI for generated clients.

Later: text search and bulk actions in the UI, Web Push, teams and roles, SMS/WhatsApp (paid and
against the one-container model). To check: that `read` API tokens omit ping tokens from responses,
and that the Prometheus output exposes grace and paused like Healthchecks does.

## Non-goals

Active HTTP/TCP/DNS checks as a focus. Document coexistence instead:
Uptime Kuma for services, Cronko for jobs.
