import type { MonitorStatus } from "@cronko/shared/types"
import { useQuery } from "@tanstack/react-query"
import { CopyButton } from "@/components/shared/CopyButton"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { useInboundEmailDomain } from "@/lib/useInboundEmail"

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative rounded-md border border-line bg-raised">
      <div className="absolute right-2 top-2">
        <CopyButton text={children} />
      </div>
      <pre className="whitespace-pre-wrap break-all p-4 pr-24 font-mono text-sm leading-relaxed text-ink">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}

const Sub = ({ children }: { children: React.ReactNode }) => (
  <h3 className="pt-2 text-sm font-semibold">{children}</h3>
)
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="max-w-[70ch] leading-relaxed text-dim">{children}</p>
)

const STATES: MonitorStatus[] = ["pending", "healthy", "missed", "down", "failed", "paused"]

export default function HowToUsePage() {
  const { t } = useT()
  // The API serves this page, so the origin is the ping host.
  const baseUrl = window.location.origin

  const { data: monitors = [] } = useQuery({
    queryKey: ["monitors"],
    queryFn: () => api.monitors.list(),
  })
  const token = monitors[0]?.token ?? "SEU_TOKEN"
  const ping = `${baseUrl}/ping/${token}`
  const inboundDomain = useInboundEmailDomain()

  const steps = [1, 2, 3, 4] as const

  return (
    <div className="max-w-3xl space-y-10 pb-16">
      <header className="space-y-2">
        <h1 className="text-2xl leading-tight">{t("howto.title")}</h1>
        <P>{t("howto.subtitle")}</P>
      </header>

      <Section title={t("howto.whatIs.title")}>
        <P>{t("howto.whatIs.p1")}</P>
        <ol className="list-decimal space-y-1 pl-5 text-sm marker:font-mono marker:text-dim">
          <li>{t("howto.flow.ping")}</li>
          <li>{t("howto.flow.wait")}</li>
          <li>{t("howto.flow.alert")}</li>
        </ol>
      </Section>

      <Section title={t("howto.create.title")}>
        <P>{t("howto.create.p1")}</P>
        <ol className="max-w-[70ch] list-decimal space-y-3 pl-5 text-sm marker:font-mono marker:text-dim">
          {steps.map((n) => (
            <li key={n}>
              <strong>{t(`howto.create.step${n}name`)}</strong>
              <span className="text-dim"> — {t(`howto.create.step${n}desc`)}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t("howto.ping.title")}>
        <P>{t("howto.ping.p1")}</P>
        <Sub>{t("howto.ping.simple")}</Sub>
        <CodeBlock>{`curl -fsS -X POST ${ping}`}</CodeBlock>
        <Sub>{t("howto.ping.withDuration")}</Sub>
        <CodeBlock>{`curl -fsS "${ping}?d=1234"`}</CodeBlock>
        <Sub>{t("howto.ping.withExit")}</Sub>
        <CodeBlock>{`curl -fsS "${ping}?exit=0"`}</CodeBlock>
        <Sub>{t("howto.ping.withLog")}</Sub>
        <CodeBlock>{`curl -fsS -X POST ${ping} \\
  -H "Content-Type: text/plain" \\
  --data-binary "$(tail -n 50 /var/log/meu-job.log)"`}</CodeBlock>
      </Section>

      <Section title={t("howto.fail.title")}>
        <P>{t("howto.fail.p1")}</P>
        <CodeBlock>{`curl -fsS -X POST "${ping}/fail?exit=2"`}</CodeBlock>
      </Section>

      <Section title={t("howto.wrapper.title")}>
        <P>{t("howto.wrapper.p1")}</P>
        <Sub>{t("howto.wrapper.install")}</Sub>
        <CodeBlock>{`sudo curl -fsSL ${baseUrl}/cronko-run -o /usr/local/bin/cronko-run
sudo chmod +x /usr/local/bin/cronko-run`}</CodeBlock>
        <Sub>{t("howto.wrapper.usage")}</Sub>
        <CodeBlock>{`0 3 * * * cronko-run ${ping} -- /usr/local/bin/meu-job.sh`}</CodeBlock>
      </Section>

      <Section title={t("howto.crontab.title")}>
        <P>{t("howto.crontab.p1")}</P>
        <CodeBlock>{`*/30 * * * * /usr/local/bin/meu-job.sh && curl -fsS ${ping} || curl -fsS ${ping}/fail`}</CodeBlock>
        <Sub>{t("howto.crontab.bashOnly")}</Sub>
        <CodeBlock>{`#!/bin/bash
START=$(date +%s%3N)
/usr/local/bin/meu-job.sh
EXIT=$?
MS=$(( $(date +%s%3N) - START ))
curl -fsS "${ping}?d=\${MS}&exit=\${EXIT}"`}</CodeBlock>
      </Section>

      <Section title={t("howto.pulse.title")}>
        <P>{t("howto.pulse.p1")}</P>
        <CodeBlock>{`curl -fsS -X POST ${ping}/start
./meu-job-longo.sh
curl -fsS -X POST "${ping}/finish?exit=$?"`}</CodeBlock>
      </Section>

      {inboundDomain && (
        <Section title={t("howto.email.title")}>
          <P>{t("howto.email.p1")}</P>
          <Sub>{t("howto.email.success")}</Sub>
          <CodeBlock>{`${token}@${inboundDomain}`}</CodeBlock>
          <Sub>{t("howto.email.fail")}</Sub>
          <CodeBlock>{`${token}+fail@${inboundDomain}`}</CodeBlock>
          <P>{t("howto.email.keywords")}</P>
        </Section>
      )}

      <Section title={t("howto.status.title")}>
        <P>{t("howto.status.p1")}</P>
        <dl className="grid max-w-[70ch] grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-3 text-sm">
          {STATES.map((s) => (
            <div key={s} className="contents">
              <dt>
                <StatusBadge status={s} />
              </dt>
              <dd className="text-dim">{t(`howto.status.${s}`)}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={t("howto.badge.title")}>
        <P>{t("howto.badge.p1")}</P>
        <div className="flex items-center gap-3">
          <img src={`${baseUrl}/badge/${token}`} alt={t("howto.badge.alt")} className="h-5" />
          <span className="text-sm text-dim">{t("howto.badge.preview")}</span>
        </div>
        <Sub>{t("howto.badge.markdown")}</Sub>
        <CodeBlock>{`![Cronko](${baseUrl}/badge/${token})`}</CodeBlock>
      </Section>

      <Section title={t("howto.notifications.title")}>
        <P>{t("howto.notifications.p1")}</P>
        <ul className="max-w-[70ch] list-disc space-y-1.5 pl-5 text-sm marker:text-dim">
          {(
            [
              "discord",
              "telegram",
              "email",
              "slack",
              "webhook",
              "ntfy",
              "pushover",
              "pagerduty",
              "teams",
              "googlechat",
              "mattermost",
              "rocketchat",
              "gotify",
              "matrix",
            ] as const
          ).map((k) => (
            <li key={k}>
              <strong className="capitalize">{k}</strong>
              <span className="text-dim"> — {t(`howto.notifications.${k}`)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
