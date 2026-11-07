# Recipes: wiring jobs to Cronko

Every recipe here uses `cronko-run`, the wrapper your Cronko instance serves at
`/cronko-run`. It runs the job, times it, sends the exit code and the last 10 KB
of output, and exits with the job's own code. It needs `sh` and `curl`.

The ping URL contains the monitor's token, so treat it as a secret. Keep it in
an environment file, a Kubernetes Secret or a CI secret, not in the command line
of a shared crontab.

In the examples, `https://cronko.example.com` is your Cronko and
`https://cronko.example.com/ping/TOKEN` is the monitor's ping URL (shown on the
monitor page).

## Install the wrapper

```bash
sudo curl -fsSL https://cronko.example.com/cronko-run -o /usr/local/bin/cronko-run
sudo chmod +x /usr/local/bin/cronko-run
```

## crontab

```cron
0 3 * * * cronko-run https://cronko.example.com/ping/TOKEN -- /usr/local/bin/backup.sh
```

To keep the URL out of the crontab, read it from a file only root can read:

```cron
0 3 * * * cronko-run "$(cat /etc/cronko/backup.url)" -- /usr/local/bin/backup.sh
```

## systemd timer

`/etc/cronko/backup.env` (mode `0600`):

```ini
CRONKO_PING_URL=https://cronko.example.com/ping/TOKEN
```

`/etc/systemd/system/backup.service`:

```ini
[Unit]
Description=Nightly backup (reported to Cronko)
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/cronko/backup.env
ExecStart=/usr/local/bin/cronko-run ${CRONKO_PING_URL} -- /usr/local/bin/backup.sh
```

`/etc/systemd/system/backup.timer`:

```ini
[Unit]
Description=Run the nightly backup at 03:00

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
```

`cronko-run` exits with the job's code, so `systemctl status backup.service` and
the journal still show a failed run as failed. In Cronko, a cron monitor with
`0 3 * * *` matches this timer.

## Kubernetes CronJob

The job image needs `sh` and `curl`. Store the ping URL in a Secret:

```bash
kubectl create secret generic backup-cronko \
  --from-literal=ping-url=https://cronko.example.com/ping/TOKEN
```

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup
spec:
  schedule: "0 3 * * *"
  timeZone: "America/Sao_Paulo"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      backoffLimit: 0
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: backup
              image: registry.example.com/backup:1.4
              env:
                - name: CRONKO_PING_URL
                  valueFrom:
                    secretKeyRef:
                      name: backup-cronko
                      key: ping-url
              command: ["sh", "-c"]
              args:
                - |
                  curl -fsSL https://cronko.example.com/cronko-run -o /tmp/cronko-run &&
                  exec sh /tmp/cronko-run "$CRONKO_PING_URL" -- /app/backup.sh
```

If the wrapper cannot be downloaded, the job does not run, and Cronko reports a
missed run. That is the safe failure. To avoid the download, copy
`cronko-run` into the image at build time instead:

```dockerfile
ADD --chmod=755 https://cronko.example.com/cronko-run /usr/local/bin/cronko-run
```

Use the same timezone in the Cronko monitor as in `timeZone`.

## GitHub Actions (scheduled workflow)

Add the ping URL as a repository secret named `CRONKO_PING_URL`. The plain version uses
`cronko-run`; the official action below does the same in one step.

```yaml
name: Nightly export
on:
  schedule:
    - cron: "0 6 * * *" # UTC
  workflow_dispatch:

jobs:
  export:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - name: Install cronko-run
        run: |
          curl -fsSL https://cronko.example.com/cronko-run -o "$RUNNER_TEMP/cronko-run"
          chmod +x "$RUNNER_TEMP/cronko-run"
      - name: Export
        env:
          CRONKO_PING_URL: ${{ secrets.CRONKO_PING_URL }}
        run: |
          "$RUNNER_TEMP/cronko-run" "$CRONKO_PING_URL" -- ./scripts/export.sh
```

### The official action

The repository ships a composite action, so there is nothing to install. It needs
`sh` and `curl` (any Linux or macOS runner), and it masks the URL in the logs.

```yaml
- uses: actions/checkout@v4
- name: Export
  uses: heapwraith/cronko@v0.4.0
  with:
    url: ${{ secrets.CRONKO_PING_URL }}
    command: ./scripts/export.sh
```

`command` is a script (several lines are fine); the step fails with the script's own exit
code, and Cronko gets the start, the duration, the exit code and the last 10 KB of output.
Other inputs: `shell` (`sh` by default, or `bash`), `timeout` (seconds per ping),
`output-limit` and `fail-on-ping-error` (default `false`: if Cronko cannot be reached the
job is **not** failed, only a warning is logged; set it to `true` to fail the step).

To report a job you do not wrap, use `report` mode in a final step that always runs:

```yaml
- name: Report to Cronko
  if: always()
  uses: heapwraith/cronko@v0.4.0
  with:
    url: ${{ secrets.CRONKO_PING_URL }}
    mode: report
    status: ${{ job.status }} # success or failure; cancelled and skipped send nothing
```

`mode: start` sends a start ping, which makes Cronko measure the duration and flag a run
that never finishes. Pin the action to a release tag (or a commit) as above. The URL can be
a token URL or a slug URL (`…/ping/k/<ping-key>/<slug>`, see the README).

GitHub can delay scheduled workflows by several minutes under load, or skip
them. Give this monitor a grace period of at least 30 minutes.

## Docker container on a host

```cron
0 2 * * * cronko-run "$(cat /etc/cronko/etl.url)" -- docker run --rm etl:latest
```

`docker run` returns the container's exit code, so a failing container is
reported as a failed run with its output.

## NAS or backup software that only sends e-mail

With ping by e-mail on (see the README), point the job's notification e-mail at
the address shown on the monitor page, `<token>@ping.example.com`. To catch
failures, either send failure notices to `<token>+fail@ping.example.com`, or set
the monitor's failure words (e.g. `failed, error`) so the subject decides.

## Without the wrapper

When `curl` is all you have, call the ping URL directly. `d` is the duration in
milliseconds and `exit` is the exit code. A non-zero exit, or the `/fail`
suffix, reports a failure.

```bash
start=$(date +%s)
./job.sh > /tmp/job.log 2>&1
code=$?
tail -c 10000 /tmp/job.log | curl -fsS -X POST -H 'Content-Type: text/plain' \
  --data-binary @- "https://cronko.example.com/ping/TOKEN?d=$((($(date +%s) - start) * 1000))&exit=$code"
```
