"use client"

import { Activity, ArrowRight, BellRing, BookOpen, Code, Link2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Card, CardBody, CardHeader, CardTitle } from "@/components/shared/Card"
import { CopyButton } from "@/components/shared/CopyButton"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative group">
      <pre className="bg-zinc-950 dark:bg-zinc-800 text-zinc-100 rounded-lg p-4 text-sm overflow-x-auto font-mono leading-relaxed">
        {children}
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={children} />
      </div>
    </div>
  )
}

function StepBadge({ num }: { num: number }) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold mr-2 shrink-0">
      {num}
    </span>
  )
}

export default function HowToUsePage() {
  const { t } = useT()
  const [baseUrl, setBaseUrl] = useState("https://cronko.example.com")
  const [exampleToken, setExampleToken] = useState("SEU_TOKEN_AQUI")

  useEffect(() => {
    setBaseUrl(window.location.origin.replace("3000", "3001"))

    api.monitors
      .list()
      .then((monitors) => {
        if (monitors.length > 0 && monitors[0]) {
          setExampleToken(monitors[0].token)
        }
      })
      .catch(() => {})
  }, [])

  const pingUrl = `${baseUrl}/ping/${exampleToken}`

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="h-5 w-5 text-emerald-400" strokeWidth={1.5} />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {t("howto.title")}
          </h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">{t("howto.subtitle")}</p>
      </div>

      {/* Section 1 — What is Cronko */}
      <Card>
        <CardHeader>
          <CardTitle>{t("howto.whatIs.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">{t("howto.whatIs.p1")}</p>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-4 flex-wrap justify-center text-sm text-zinc-600 dark:text-zinc-300">
              <span className="flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-emerald-500" strokeWidth={1.5} />
                <strong className="text-emerald-600 dark:text-emerald-400">Job envia ping</strong>
              </span>
              <ArrowRight className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
              <span className="flex items-center gap-1.5">
                <Code className="h-4 w-4 text-blue-500" strokeWidth={1.5} />
                <strong className="text-blue-600 dark:text-blue-400">
                  Cronko espera intervalo
                </strong>
              </span>
              <ArrowRight className="h-4 w-4 text-zinc-400" strokeWidth={1.5} />
              <span className="flex items-center gap-1.5">
                <BellRing className="h-4 w-4 text-red-500" strokeWidth={1.5} />
                <strong className="text-red-600 dark:text-red-400">
                  Se atrasar, dispara alerta
                </strong>
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Section 2 — Creating a Monitor */}
      <Card>
        <CardHeader>
          <CardTitle>{t("howto.create.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">{t("howto.create.p1")}</p>
          <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
            <li className="flex items-start gap-2">
              <StepBadge num={1} />
              <span>
                <strong>{t("howto.create.step1name")}</strong> — {t("howto.create.step1desc")}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <StepBadge num={2} />
              <span>
                <strong>{t("howto.create.step2name")}</strong> — {t("howto.create.step2desc")}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <StepBadge num={3} />
              <span>
                <strong>{t("howto.create.step3name")}</strong> — {t("howto.create.step3desc")}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <StepBadge num={4} />
              <span>
                <strong>{t("howto.create.step4name")}</strong> — {t("howto.create.step4desc")}
              </span>
            </li>
          </ul>
        </CardBody>
      </Card>

      {/* Section 3 — Sending Pings */}
      <Card>
        <CardHeader>
          <CardTitle>{t("howto.ping.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">{t("howto.ping.p1")}</p>

          <h4 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
            {t("howto.ping.simple")}
          </h4>
          <CodeBlock>{`curl -X POST ${pingUrl}`}</CodeBlock>

          <h4 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
            {t("howto.ping.withDuration")}
          </h4>
          <CodeBlock>{`curl "${pingUrl}?d=1234"`}</CodeBlock>

          <h4 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
            {t("howto.ping.withExit")}
          </h4>
          <CodeBlock>{`curl "${pingUrl}?exit=0"`}</CodeBlock>

          <h4 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
            {t("howto.ping.withLog")}
          </h4>
          <CodeBlock>{`curl -X POST ${pingUrl} \\
  -H "Content-Type: text/plain" \\
  -d "$(tail -n 50 /var/log/meu-job.log)"`}</CodeBlock>
        </CardBody>
      </Card>

      {/* Section 4 — Crontab Integration */}
      <Card>
        <CardHeader>
          <CardTitle>{t("howto.crontab.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {t("howto.crontab.p1")}
          </p>
          <CodeBlock>{`# Exemplo: job roda a cada 30 minutos
*/30 * * * * /usr/local/bin/meu-job.sh && curl -s "${pingUrl}?d=$SECONDS&exit=$?"`}</CodeBlock>

          <h4 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
            {t("howto.crontab.bashOnly")}
          </h4>
          <CodeBlock>{`#!/bin/bash
START=$SECONDS
/usr/local/bin/meu-job.sh
EXIT=$?
DURATION=$(( SECONDS - START ))
curl -s "${pingUrl}?d=\${DURATION}&exit=\${EXIT}"`}</CodeBlock>
        </CardBody>
      </Card>

      {/* Section 5 — Pulse (start/finish) */}
      <Card>
        <CardHeader>
          <CardTitle>{t("howto.pulse.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">{t("howto.pulse.p1")}</p>
          <CodeBlock>{`# Envia "start" antes do job
curl -X POST ${baseUrl}/ping/${exampleToken}/start

# Roda o job
./meu-job-longo.sh

# Envia "finish" com duração e exit code
curl -X POST "${baseUrl}/ping/${exampleToken}/finish?d=$SECONDS&exit=$?"`}</CodeBlock>
        </CardBody>
      </Card>

      {/* Section 6 — Status cycle */}
      <Card>
        <CardHeader>
          <CardTitle>{t("howto.status.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">{t("howto.status.p1")}</p>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 flex-wrap justify-center text-sm font-mono">
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                pending
              </span>
              <ArrowRight className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                healthy
              </span>
              <ArrowRight className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                missed
              </span>
              <ArrowRight className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
              <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                down
              </span>
              <ArrowRight className="h-3 w-3 text-zinc-400" strokeWidth={1.5} />
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                healthy
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Section 7 — Badge */}
      <Card>
        <CardHeader>
          <CardTitle>{t("howto.badge.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">{t("howto.badge.p1")}</p>
          <div className="flex items-center gap-3">
            <img src={`${baseUrl}/badge/${exampleToken}`} alt="Status badge" className="h-5" />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {t("howto.badge.preview")}
            </span>
          </div>
          <h4 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">
            {t("howto.badge.markdown")}
          </h4>
          <CodeBlock>{`![Cronko](${baseUrl}/badge/${exampleToken})`}</CodeBlock>
        </CardBody>
      </Card>

      {/* Section 8 — Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>{t("howto.notifications.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {t("howto.notifications.p1")}
          </p>
          <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300 list-disc list-inside">
            <li>
              <Link2 className="inline h-3.5 w-3.5 text-indigo-500 mr-1" strokeWidth={1.5} />
              <strong>Discord</strong> — {t("howto.notifications.discord")}
            </li>
            <li>
              <Link2 className="inline h-3.5 w-3.5 text-blue-500 mr-1" strokeWidth={1.5} />
              <strong>Telegram</strong> — {t("howto.notifications.telegram")}
            </li>
            <li>
              <Link2 className="inline h-3.5 w-3.5 text-zinc-500 mr-1" strokeWidth={1.5} />
              <strong>Email</strong> — {t("howto.notifications.email")}
            </li>
            <li>
              <Link2 className="inline h-3.5 w-3.5 text-green-500 mr-1" strokeWidth={1.5} />
              <strong>Slack</strong> — {t("howto.notifications.slack")}
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}
