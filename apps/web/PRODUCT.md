# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers and sysadmins who self-host and run scheduled work on their own servers: cron jobs, backups, ETLs, report generators. They open the dashboard rarely and with intent: when an alert arrives (Discord, Telegram, e-mail, Slack) and they need to diagnose fast, and for an occasional glance to confirm everything ran. They live in terminals, crontabs and `docker compose`; they read exit codes and job output.

## Product Purpose

Cronko tells you when a job stops running or fails. Each monitor has a ping URL the job calls; if the ping does not arrive within the expected interval plus grace, or the job reports failure, Cronko opens an incident and alerts. Success means a lost or failed job is noticed within minutes and the alert leads to a diagnosis in one screen.

## Positioning

Dead-man's-switch semantics for scheduled jobs (start, finish, fail, duration, exit code, captured output), in a single self-hosted container backed by one SQLite file. It is not an uptime or observability tool and does not run active HTTP/TCP checks; Uptime Kuma is a different category and Healthchecks.io is the nearest neighbour. Differentiation is simple operation, job-level insight (not just up/down) and a first-class Portuguese experience.

## Operating Context

Pinged from crontab with `curl`, from scripts, systemd units, Kubernetes CronJobs and CI. Deployed with `docker compose` behind a reverse proxy (Caddy, nginx, Traefik). Alerts arrive on a phone or chat first; the web UI is the second step. The UI is a single-page app served by the same process as the API.

## Capabilities and Constraints

- Monitor states: healthy, pending, missed (late, within escalation), down (silent too long), failed (job ran and reported failure), paused. Missed, down and failed are distinct on purpose.
- Pulse start/finish with duration, exit code, optional captured output (up to 10 KB), max-duration alerts, incident history, audit log, CSV export, public SVG status badge.
- Notification channels: Discord, Telegram, e-mail (SMTP), Slack; alerts are delivered from a persistent outbox with retry and a delivery log API.
- Screens: login, dashboard, monitors (list, detail, new, edit), incidents, notifications, settings, how-to-use.
- Languages: Brazilian Portuguese (default) and English. Dark and light themes, installable PWA, command palette and keyboard shortcuts exist today.
- Technical: Vite + React 19 + React Router + TanStack Query + Tailwind 4; same-origin cookie sessions; strict CSP forbids inline scripts.
- Planned and undecided in detail: cron-expression schedules with timezone (and next expected run), a notification delivery log screen, status pages, more channels, multi-user.

## Brand Commitments

- Name: Cronko.
- Default language pt-BR; default theme dark.
- Current logo mark (`public/icon.svg`, `CronkoLogo`) is kept by default but the user said nothing is mandatory, so it may evolve if the redesign earns it.

## Evidence on Hand

No customers, testimonials, benchmarks or press exist; none may be fabricated. Real content is limited to the product's own copy in `packages/shared/src/translations.ts` and the README. There is no marketing site.

## Product Principles

1. An alert should lead to a diagnosis on one screen: what ran, when, how long, exit code, output.
2. Failure states are honest and distinct: late, silent and failed are different problems with different next steps.
3. Built for operators: dense, scannable, keyboard-first, calm when everything is fine, unmistakable when it is not.
4. Job semantics over generic uptime: duration, schedule and exit status are the vocabulary.
5. Self-hosting stays trivial: one container, no heavy runtime dependencies in the UI.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Status must never rely on color alone (shape/icon and text accompany it). Full keyboard operation; visible focus; respect `prefers-reduced-motion`. The Biome a11y rules are enforced and currently report about 100 warnings in the legacy UI that this redesign must clear.
