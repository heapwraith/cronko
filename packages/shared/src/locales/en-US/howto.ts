export const howto = {
  "howto.title": "How to Use",
  "howto.flow.ping": "The job sends a ping",
  "howto.flow.wait": "Cronko waits for the interval plus grace",
  "howto.flow.alert": "If none arrives, it opens an incident and alerts",
  "howto.fail.title": "Reporting a failure",
  "howto.fail.p1":
    "When the job exits with an error, call /fail: the alert goes out immediately instead of waiting for the interval to run out. Without an exit code, Cronko records 1.",
  "howto.status.pending": "Created, no ping yet.",
  "howto.status.healthy": "The last ping arrived on time.",
  "howto.status.missed": "Late: past the interval, still inside the grace period.",
  "howto.status.down": "Silent past the grace period. An incident was opened.",
  "howto.status.failed": "The job ran and reported a failure.",
  "howto.status.paused": "Paused: no alerts.",
  "howto.badge.alt": "Status badge",
  "howto.subtitle":
    "Learn how to integrate Cronko with your jobs, scripts and cron tabs in minutes.",
  "howto.whatIs.title": "What is Cronko?",
  "howto.whatIs.p1":
    "Cronko is a monitoring service for cron jobs and scheduled tasks. Your jobs send pings (heartbeats) and Cronko alerts you when something stops working.",
  "howto.create.title": "Creating Your First Monitor",
  "howto.create.p1": "Each monitor represents a job or task you want to track. Follow these steps:",
  "howto.create.step1name": "Go to Monitors → New Monitor",
  "howto.create.step1desc":
    "Name it and say how the job runs: every interval (e.g. 1 hour) or on a cron expression with a timezone.",
  "howto.create.step2name": "Set the grace period",
  "howto.create.step2desc": "Extra time, in minutes, before it is marked late. E.g. 5 minutes.",
  "howto.create.step3name": "Optional: set max duration",
  "howto.create.step3desc":
    "If the job takes longer than this, an incident is automatically generated.",
  "howto.create.step4name": "Copy the ping URL",
  "howto.create.step4desc":
    "It is on the monitor page and holds a secret token, unique per monitor. The examples below already use your first monitor's.",
  "howto.ping.title": "Sending Pings",
  "howto.ping.p1":
    "Your job should make an HTTP request to Cronko when it finishes. Use the examples below with your token:",
  "howto.ping.simple": "Simple ping",
  "howto.ping.withDuration": "With duration (ms)",
  "howto.ping.withExit": "With exit code",
  "howto.ping.withLog": "With log (last 50 lines)",
  "howto.wrapper.title": "cronko-run: the easiest way",
  "howto.wrapper.p1":
    "A script that runs your job, times it, captures its output and reports to Cronko on its own. A non-zero exit becomes a failure and the output shows on the run page. Needs only sh and curl.",
  "howto.wrapper.install": "Install",
  "howto.wrapper.usage": "Use it in crontab",
  "howto.crontab.title": "Crontab Integration",
  "howto.crontab.p1":
    "Practical crontab integration example. Success calls the normal ping; an error calls /fail.",
  "howto.crontab.bashOnly": "Bash script with duration measurement",
  "howto.pulse.title": "Pulse — Measuring Duration (Start/Finish)",
  "howto.pulse.p1":
    "For long-running jobs, use the pulse pattern: send /start before starting and /finish when done. Duration is calculated automatically.",
  "howto.email.title": "Ping by e-mail",
  "howto.email.p1":
    "For devices that can only send e-mail (NAS, backup software, routers). Every message received counts as a ping; the sender, subject and text become the run output.",
  "howto.email.success": "Success",
  "howto.email.fail": "Failure",
  "howto.email.keywords":
    "You can also set failure words in the monitor form: a subject containing one counts as a failure.",
  "howto.status.title": "Status Cycle",
  "howto.status.p1": "Understand a monitor's lifecycle:",
  "howto.badge.title": "Public Status Badge",
  "howto.badge.p1":
    "Display your monitor's status anywhere with a public SVG badge. No authentication required.",
  "howto.badge.preview": "Live preview",
  "howto.badge.markdown": "Embed in README (Markdown)",
  "howto.badge.tagTitle": "Tag badge",
  "howto.badge.tagP1":
    "Summarises every monitor with a tag (the worst state wins; paused ones are ignored). It only works while a status page for that tag is switched on. Replace prod with your tag.",
  "howto.badge.shields": "Through shields.io (endpoint)",
  "howto.notifications.title": "Notifications",
  "howto.notifications.p1":
    "Set up channels on the Notifications page. Alerts go out when a monitor is late, goes down, fails, exceeds its max duration, and when it recovers. Maintenance windows and the delivery log live there too; the daily or weekly digest is under Settings.",
  "howto.notifications.discord": "Discord Webhook — receive alerts in any channel.",
  "howto.notifications.telegram": "Telegram Bot — send alerts to a chat.",
  "howto.notifications.email": "SMTP Email — email alerts.",
  "howto.notifications.slack": "Slack Webhook — integration with Slack channels.",
  "howto.notifications.googlechat": "Incoming webhook of a Google Chat space.",
  "howto.notifications.mattermost": "Mattermost incoming webhook (self-hosted).",
  "howto.notifications.rocketchat": "Rocket.Chat incoming webhook (self-hosted).",
  "howto.notifications.gotify": "Gotify server (self-hosted) with an application token.",
  "howto.notifications.matrix": "Message in a Matrix room, with homeserver, token and room ID.",
  "howto.notifications.apprise": "Any service Apprise supports, through your own apprise-api.",
  "howto.notifications.webhook": "Generic webhook — receives JSON with event, monitor and message.",
  "howto.notifications.ntfy": "ntfy — phone push via ntfy.sh or your own server.",
  "howto.notifications.pushover":
    "Pushover — phone push; failures and outages break through quiet hours.",
  "howto.notifications.pagerduty":
    "PagerDuty — opens an incident with a severity and resolves it when the job recovers.",
  "howto.notifications.teams":
    'Microsoft Teams — webhook from a Workflows flow ("Post to a channel when a webhook request is received").',
  "howto.notifications.webpush":
    "Web Push — alerts straight to the browser or phone, no third-party app.",
} as const
