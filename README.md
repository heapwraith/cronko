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

# Healthchecks-style: the exit status in the path (0 = success, 1-255 = failure)
./job.sh; curl -fsS "https://cronko.example.com/ping/TOKEN/$?"

# attach a progress note without touching the monitor's state (see GET /api/monitors/:id/logs)
curl -fsS --data-raw "step 3 of 5" -H 'content-type: text/plain' https://cronko.example.com/ping/TOKEN/log

# concurrent runs: give each run an id so its /finish (or /fail) closes the right /start
RID=$(uuidgen)
curl -fsS "https://cronko.example.com/ping/TOKEN/start?rid=$RID"
./job.sh; S=$?; curl -fsS "https://cronko.example.com/ping/TOKEN/$S?rid=$RID"
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
  ghcr.io/heapwraith/cronko:0.4
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
- Alerts to Discord, Telegram, e-mail (SMTP), Slack, Microsoft Teams, Google Chat, Mattermost, Rocket.Chat, Gotify, Matrix, Apprise, ntfy, Pushover, PagerDuty and any webhook
- Run analytics: each run is compared with the runs before it (median, p95); runs much slower than usual and runs that started before the previous one finished are flagged, with optional alerts per monitor
- Tags per monitor, with a tag filter on the dashboard and monitor list (`?tag=` in the API)
- Search (name, slug, tags) and bulk actions on the monitor list: pause, resume, mute, tag, delete (`POST /api/monitors/bulk`)
- Public status pages per tag (`/status/<slug>`, no login): current state, 90 days of daily availability and recent incidents, never tokens or job output
- Recurring maintenance windows (days, start time, duration and timezone) for all monitors, a tag or one monitor: alerts are held back while one runs
- Scoped API tokens (read or write) for scripts and CI, managed in Settings
- Ping by e-mail (`<token>@your-domain`) for devices that can only send mail, with optional failure words per monitor
- Daily or weekly digest to every channel: state, failures, new incidents and jobs that went silent
- Mute a monitor's alerts for maintenance (1 h to 7 days); state and incidents are still tracked
- Public SVG status badges per monitor (`/badge/:token`) and per tag (`/badge/tag/:tag`, only while a status page for the tag is on), also as `.json` and shields.io endpoint (`.shields.json`); CSV export of heartbeats
- Dashboard, dark/light theme, English and pt-BR, installable PWA
- OpenAPI docs at `/docs`; health probes at `/health/live` and `/health/ready`
- Scheduled automatic backups, online backup and restore (`node scripts/db.mjs backup|restore`)
- JSON export of monitors, tags, channels, status pages and maintenance windows, and import of it

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
| `METRICS_TOKEN`                                                 | no       | Enables `GET /metrics` (Prometheus) for requests sending `Authorization: Bearer <token>`; at least 16 characters. Unset = 404                                     |
| `INBOUND_SMTP_PORT`, `INBOUND_EMAIL_DOMAIN`                     | no       | Ping by e-mail: an SMTP listener on this port accepts mail for `<token>@<domain>` (see below)                                                                     |
| `INBOUND_SMTP_TLS_CERT`, `INBOUND_SMTP_TLS_KEY`                 | no       | PEM files to offer STARTTLS on the e-mail listener                                                                                                                |
| `BACKUP_DIR`, `BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP`            | no       | Scheduled SQLite backups into this directory (unset = off), every 24 h by default, keeping the newest 7 (see [Backups](#backups-and-restore))                     |
| `PUBLIC_URL`                                                    | no       | Public address of this Cronko (e.g. `https://cronko.example.com`); alerts then include a link to the failing run or monitor                                       |
| `AUTO_MIGRATE`                                                  | no       | Apply migrations on boot (default `true`, but `false` when `NODE_ENV=production`; the image sets `true`)                                                          |
| `WEB_DIST`                                                      | no       | Path of the built web app (auto-detected)                                                                                                                         |

Notification channels are configured in the UI: Discord/Slack take a
`webhookUrl`, Telegram a `botToken` and `chatId`, e-mail a recipient `to`.
ntfy takes a `topic` (plus optional `serverUrl` for a self-hosted server and an
access `token`). A generic webhook takes a `url` and receives
`{ "event", "monitor", "message", "sentAt" }` as JSON, unless you set a body
template (see below). Pushover takes a `userKey`
and an `appToken`. Microsoft Teams takes the `webhookUrl` of a Workflows flow
("Post to a channel when a webhook request is received"), since Office 365
connectors are retired. PagerDuty takes the `routingKey` of an Events API v2
integration: problems trigger an incident (one per monitor) and recovery resolves it.
Google Chat, Mattermost and Rocket.Chat take the `webhookUrl` of an incoming webhook.
Gotify takes the `serverUrl` and the `appToken` of an application (high-priority
events use priority 7-8). Matrix takes the `homeserverUrl`, an `accessToken` of the
sending user and the `roomId` (like `!abc123:matrix.org`, not the `#alias`); the user
must already be in the room, and encrypted rooms are not supported because messages
are sent unencrypted.

**Apprise** reaches dozens of services through your own
[apprise-api](https://github.com/caronc/apprise-api). Give Cronko the `serverUrl`
and either the `configKey` of a configuration saved in apprise-api (`POST /notify/{key}`)
or inline `urls` (`POST /notify`); the Apprise URLs carry tokens, so treat them as
secrets. Events map to Apprise types (down, failed and missed are `failure`; slow,
unusual and overlap are `warning`; recovered is `success`; the rest `info`). To run
apprise-api next to Cronko, add a service to `docker-compose.yml`:

```yaml
apprise:
  image: caronc/apprise:latest
  restart: unless-stopped
  volumes:
    - apprise_config:/config
```

and use `http://apprise:8000` as the server URL (declare the `apprise_config` volume).
The request shape is written from Apprise's documentation and was not tested against
a running apprise-api.

### Webhook headers and body template

A generic webhook channel accepts two optional fields. `headers` is one
`Name: value` per line (for tokens and API keys); values are secrets, so the API
only returns them masked and keeps the stored value when you save the form
without changing them. `bodyTemplate` replaces the default JSON body. It supports
only `{{event}}`, `{{status}}` (`up` or `down`), `{{message}}` (the alert text
without its link), `{{url}}` (link to Cronko), `{{sentAt}}` and `{{monitor.name}}`.
Unknown placeholders are rejected when you save. Values are JSON-escaped unless
you set a non-JSON `Content-Type` header, in which case they are inserted as is.

Slack-compatible endpoint (also Mattermost and Rocket.Chat incoming webhooks):

```text
body template: {"text": "*{{monitor.name}}* is {{status}}: {{message}} <{{url}}|open>"}
```

Gotify (`POST /message`, token in a header):

```text
headers:       X-Gotify-Key: <app token>
body template: {"title": "Cronko: {{monitor.name}}", "message": "{{message}}", "priority": 5}
```

### Backups and restore

Set `BACKUP_DIR` and Cronko writes a consistent snapshot of the database inside
the API process, using SQLite's online backup (safe while it keeps serving). Every
`BACKUP_INTERVAL_HOURS` (default 24) it writes `cronko-<utc>.db`, checks the copy
with `PRAGMA integrity_check`, renames it into place only if that passes (a failed
run leaves no half-written file) and deletes all but the newest `BACKUP_KEEP`
(default 7). Only files named `cronko-*.db` are ever deleted. After a restart the
next backup waits out the rest of the interval. Failures are logged and shown in
Settings, next to the time and size of the last good backup; they never stop the
server. The same status is at `GET /api/settings/backup`.

With the bundled `docker-compose.yml` the backups go to a second volume, so a
damaged data volume does not take them along:

```sh
echo "BACKUP_DIR=/app/backups" >> .env
docker compose up -d
docker compose exec cronko ls -l /app/backups
```

A volume on the same disk is not a backup against disk loss: bind-mount a
directory that something else copies off the host (`./backups:/app/backups`,
owned by uid 1000), or point `BACKUP_DIR` at a subfolder of `/app/data`
(`/app/data/backups`) if one volume is all you have.

**Restore** (stop the API first, the script replaces the database file):

```sh
docker compose stop cronko
docker compose run --rm --no-deps -v cronko_backups:/app/backups cronko \
  node scripts/db.mjs restore /app/backups/cronko-2026-11-06T02-00-00-000Z.db
docker compose up -d
```

Outside Docker: `node scripts/db.mjs restore path/to/cronko-....db` with
`DATABASE_URL` set. It verifies the file, removes the stale `-wal`/`-shm` files
and copies the backup over the database. `node scripts/db.mjs backup [file]` takes
a one-off snapshot the same way.

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

### Importing from Healthchecks or Uptime Kuma

Two authenticated endpoints create monitors from other tools. Both accept
`?dryRun=true` to report what would be created and skipped without changing
anything, and both go through the same validation as `POST /api/monitors`.
The response is `{ data: { dryRun, created[], skipped[] } }`; each entry has
`warnings` for anything that had no equivalent. A name that already exists
(same slug) is skipped, so re-running an import is safe.

**Healthchecks** (`POST /api/import/healthchecks`). Send the saved response of
`GET /api/v3/checks/` (`{"checks": [...]}`), or `{"apiKey": "...", "baseUrl": "https://hc.example.com"}`
and Cronko fetches it with `X-Api-Key` (`baseUrl` defaults to `https://healthchecks.io`;
a read-only key is enough).

| Healthchecks                | Cronko                        |
| --------------------------- | ----------------------------- |
| `name` (or `slug` if empty) | name                          |
| `timeout`                   | expected interval             |
| `schedule` + `tz`           | cron schedule + timezone      |
| `grace`                     | grace period (capped at 24 h) |
| `tags` (space separated)    | tags                          |
| `status: "paused"`          | paused                        |

Not imported: integrations/channels, keyword filters (`start_kw`, `success_kw`,
`failure_kw`), `desc`, ping history and the old ping URLs. Imported monitors get
new tokens, so update the ping URLs in your jobs.

**Uptime Kuma** (`POST /api/import/kuma`). Send the backup JSON (Settings -> Backup
in Kuma 1.x) as the body. Only `push` monitors are imported (`interval` becomes the
expected interval, `active: 0` becomes paused, tags by name, default grace period).
Every other type is an active check, which Cronko does not do, and is listed under
`skipped`. Kuma's push tokens are not reused.

```sh
curl -X POST "$CRONKO/api/import/kuma?dryRun=true" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" --data @kuma-backup.json
```

### Exporting and importing configuration

`GET /api/export` returns your setup as JSON (`format: "cronko-export"`): monitors
(settings, tags, paused state), tags, notification channels, status pages and
maintenance windows. It has no heartbeat history and no ping tokens, so an
imported monitor gets a new ping URL.

- Channel secrets (webhook URLs, bot tokens, routing and user keys) are
  `"[REDACTED]"` by default, so the file is safe to keep in version control or share.
- `?includeSecrets=true` includes them in clear text and needs a browser session
  or login: an API token, even with `write` scope, gets `403`. Treat that file like a password.
- Every export is in the audit log (`config.exported`, `config.exported_with_secrets`).

`POST /api/import/cronko` takes that JSON as the body, with `?dryRun=true` like the
other importers, and answers `{ data: { dryRun, created, skipped, channels, statusPages, maintenanceWindows } }`
(each section has `created` and `skipped`). Existing monitor names, status page slugs,
maintenance window names and channels with the same type and name are skipped, so
re-running is safe. A channel whose secrets were redacted is skipped with a
reason (add it by hand, or export with secrets). Maintenance windows aimed at one
monitor travel by its slug. Import needs a session too: API tokens cannot import.

```sh
curl -b "cronko_token=$SESSION" "$CRONKO/api/export" -o cronko.json
curl -b "cronko_token=$SESSION" -X POST "$CRONKO/api/import/cronko?dryRun=true" \
  -H "Content-Type: application/json" --data @cronko.json
```

### Ping by slug (provisioning from CI)

Every monitor is pinged by its secret token. For scripts that already know the monitor's
readable **slug**, generate the instance **ping key** in Settings → Ping key and use:

```sh
curl -fsS "$CRONKO/ping/k/$PING_KEY/nightly-backup"            # success
curl -fsS "$CRONKO/ping/k/$PING_KEY/nightly-backup/start"      # also /finish, /fail, /log, /<exit>
curl -fsS "$CRONKO/ping/k/$PING_KEY/nightly-backup?create=1&timeout=86400&grace=3600"
```

The slug is the monitor name in lowercase with dashes (`Nightly backup` is `nightly-backup`).
`rid`, `d`, `exit` and POST bodies work as on the token URL. With `?create=1` an unknown slug
is created on its first ping, using `timeout` (expected interval in seconds, default 86400) and
`grace` (seconds, default 3600); such monitors get the `auto-created` tag, are written to the
audit log, and are capped at 20 per hour and 100 in total. Without `create=1` an unknown slug is
a 404 and nothing is created.

The key is a secret: anyone holding it can ping any monitor and create monitors (within the
limits). It is stored as is next to the per-monitor tokens, because the UI has to show it
again; rotating it (Settings → Ping key) stops the old one immediately. It is never available
to API tokens. Wrong keys are counted per client address (30 a minute), which slows guessing
down but never blocks a correct key.

### Single sign-on (OIDC and trusted proxy)

Both options are **off by default** and both only sign in a user that **already exists**
(matched by e-mail): Cronko never registers anyone, so the local user list is the allowlist.
A successful SSO sign-in gives the same session as a password login and is written to the audit
log with its method. SSO does not ask for the local TOTP code (the identity provider owns the
second factor); the password login keeps its own 2FA.
**OIDC** (authorization code with PKCE, `state` and `nonce`):

| Variable                                                                                             | Meaning                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `OIDC_ISSUER`                                                                                        | Issuer URL; `/.well-known/openid-configuration` must live under it                              |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`                                                               | The client registered for Cronko                                                                |
| `OIDC_REDIRECT_URL`                                                                                  | Optional. Default: `PUBLIC_URL` + `/auth/sso/oidc/callback` (register this URL at the provider) |
| The ID token must be signed with an asymmetric key published in the provider's JWKS, and its         |
| issuer, audience, expiry and nonce are checked. `email` must be present with `email_verified: true`. |
| Cronko asks for the `openid email` scopes only. Failed sign-ins share the password login's limit     |
| (5 in 15 minutes per address).                                                                       |
| **Trusted proxy** (Authelia, Authentik, oauth2-proxy, Cloudflare Access...): set                     |
| `TRUSTED_PROXY_AUTH_HEADER` (for example `Remote-Email`) **and** `TRUSTED_PROXY_IPS`                 |
| (comma-separated IPs or CIDRs of your proxies). The header is honoured only when the TCP peer        |
| that connected to Cronko is in that list; a forwarded header such as `X-Forwarded-For` never         |
| makes a peer trusted. **If Cronko is reachable without going through the proxy from an address       |
| in that list, anyone there can sign in as anyone**: keep Cronko on a network only the proxy can      |
| reach. The login page then offers "Continue with your organization login", which opens               |
| `/auth/sso/proxy`.                                                                                   |
| `PASSWORD_LOGIN_DISABLED=true` hides the password form and answers 403 to `/auth/login`. Cronko      |
| refuses to start with it unless OIDC or trusted-proxy login is configured, so you cannot lock        |
| yourself out by mistake. If the identity provider is down, remove the variable and restart.          |
| These flows were tested against a fake provider written for the tests, not against a real            |
| Keycloak, Authentik or Google: try a sign-in on a real one before relying on it.                     |

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

### Two-factor authentication

Turn it on in Settings → Two-factor authentication: scan the QR code (drawn in your
browser, nothing is sent to a third party) or type the key into an authenticator app
(RFC 6238 TOTP: SHA-1, 6 digits, 30 s), confirm with a code, and save the 10
single-use recovery codes shown once. From then on, signing in takes the password and
then a code (or a recovery code). Disabling needs the password and a code.

- The TOTP secret is encrypted at rest (AES-256-GCM) with a key derived from `JWT_SECRET`.
  **Rotating `JWT_SECRET` makes enrolled secrets unreadable**: app codes stop working for those
  accounts. A recovery code still signs in (they are hashed, not encrypted); use it to disable 2FA
  and enroll again.
- A code works once per 30 s step (replays are refused); the code step shares the login
  failure limit with the password step.
- API tokens (`Authorization: Bearer crk_...`) are unaffected and cannot manage 2FA.
- Locked out with no recovery code: stop Cronko and clear the columns directly,
  `UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL;`
  (and `DELETE FROM recovery_codes;`).

#### Security keys (WebAuthn)

Once the authenticator app is on, Settings → Two-factor authentication → Security keys lets you
register hardware keys or passkeys. At sign-in the second step then offers **Use a security key**
next to the code field; the code and the recovery codes keep working, so a lost key never locks you
out. Removing a key asks for the password, and turning the authenticator app off removes the keys.

- It needs a known address: set `PUBLIC_URL` (or `WEBAUTHN_ORIGIN`, and `WEBAUTHN_RP_ID` if the
  relying party is a parent domain). Without one the section only says so, because a wrong origin
  would make registered keys useless. Changing the host later invalidates the keys.
- The key is a second factor, not a replacement for the password: touching it is enough, and
  PIN or fingerprint is not demanded. Attestation is not checked (any authenticator is accepted).
- Each login challenge is accepted once, the signature counter must not go backwards, and
  failures share the login rate limit. API tokens cannot manage keys.
- Tested against a software authenticator that produces real signed registrations and assertions
  (a bad signature, origin, relying party, a replay and a cloned counter are all refused), **not**
  against physical keys or a browser: try your own key after enabling it.

## Security

- Passwords: bcrypt (12 rounds). Sessions: HS256 JWT, 15-minute access token and
  7-day refresh token in `HttpOnly`, `SameSite=Strict` cookies (`Secure` in production).
- CSRF: state-changing requests with a cookie session must be same-origin
  (`Sec-Fetch-Site`, falling back to `Origin`); `Authorization` clients are exempt.
- Optional TOTP two-factor login with hashed single-use recovery codes, plus optional security keys (see above).
- Logout revokes the access and refresh tokens server-side (denylist by `jti`), not only the cookies.
- Login limited to 5 attempts per 15 minutes per IP and e-mail (password and 2FA code share the count); pings are rate limited per token.
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
