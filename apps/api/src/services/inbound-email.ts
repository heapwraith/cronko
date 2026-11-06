/**
 * Ping by e-mail. A small SMTP listener that only accepts mail for existing
 * monitors (<token>@domain or <token>+fail@domain) and turns each message into a
 * ping. It never relays, needs no AUTH, and refuses unknown recipients at RCPT
 * time, so a misaddressed or spam message is rejected before any data is read.
 */
import { readFileSync } from "node:fs"
import { findMonitorByToken } from "@cronko/database/queries/monitors"
import { classifyEmail, emailRunBody, parseRecipient } from "@cronko/shared/email-ping"
import { simpleParser } from "mailparser"
import { SMTPServer } from "smtp-server"
import { logger } from "../lib/logger"
import { createWindowCounter } from "../middleware/rateLimit"
import { currentSettings } from "../routes/settings"
import { processHeartbeat } from "./heartbeat"

/** Whole message, attachments included. Job reports are small; this is generous. */
export const MAX_MESSAGE_BYTES = 1_000_000
/** Same cap as the output of an HTTP ping. */
const MAX_BODY_LENGTH = 10_000
const MAX_RECIPIENTS = 10

export interface InboundEmailOptions {
  port: number
  host: string
  domain: string
  tls?: { cert: string; key: string } | undefined
}

/** An SMTP reply error: 5xx is permanent (the sender gives up), 4xx is retried. */
function smtpError(code: number, message: string) {
  return Object.assign(new Error(message), { responseCode: code })
}

export function createInboundEmailServer(options: InboundEmailOptions) {
  const hit = createWindowCounter(() => currentSettings.pingRateLimitPerMinute)

  return new SMTPServer({
    name: options.domain,
    banner: "Cronko ping inbox",
    authOptional: true,
    disabledCommands: options.tls ? ["AUTH"] : ["AUTH", "STARTTLS"],
    ...(options.tls && { key: options.tls.key, cert: options.tls.cert }),
    size: MAX_MESSAGE_BYTES,
    maxClients: 50,
    socketTimeout: 30_000,
    closeTimeout: 5_000,
    logger: false,

    onRcptTo(address, session, callback) {
      if (session.envelope.rcptTo.length >= MAX_RECIPIENTS) {
        return callback(smtpError(452, "Too many recipients"))
      }
      const target = parseRecipient(address.address, options.domain)
      if (!target) return callback(smtpError(550, "No such mailbox"))
      findMonitorByToken(target.token)
        .then((monitor) => callback(monitor ? undefined : smtpError(550, "No such mailbox")))
        .catch(() => callback(smtpError(451, "Try again later")))
    },

    onData(stream, session, callback) {
      simpleParser(stream)
        .then(async (mail) => {
          if ((stream as { sizeExceeded?: boolean }).sizeExceeded) {
            throw smtpError(552, "Message too large")
          }
          const subject = mail.subject ?? ""
          const body = emailRunBody(
            { from: mail.from?.text, subject, text: mail.text },
            MAX_BODY_LENGTH,
          )
          for (const rcpt of session.envelope.rcptTo) {
            const target = parseRecipient(rcpt.address, options.domain)
            if (!target) continue
            if (!hit(target.token).allowed) {
              logger.warn("e-mail ping dropped: rate limit")
              continue
            }
            const monitor = await findMonitorByToken(target.token)
            if (!monitor) continue
            const kind = classifyEmail(target.kind, subject, monitor.emailFailureKeywords)
            await processHeartbeat(target.token, {
              ...(session.remoteAddress && { sourceIp: session.remoteAddress }),
              userAgent: "e-mail",
              body,
              ...(kind === "fail" && { failed: true, exitCode: 1 }),
            })
            logger.info({ monitor: monitor.name, kind }, "e-mail ping received")
          }
          callback()
        })
        .catch((err: Error & { responseCode?: number }) => {
          if (err.responseCode) return callback(err)
          logger.error({ err }, "e-mail ping failed")
          callback(smtpError(451, "Try again later"))
        })
    },
  })
}

let server: SMTPServer | undefined

export function startInboundEmail(options: InboundEmailOptions | null) {
  if (!options) return
  server = createInboundEmailServer(options)
  server.on("error", (err) => logger.error({ err }, "inbound SMTP error"))
  server.listen(options.port, options.host, () => {
    logger.info(
      { port: options.port, domain: options.domain, starttls: !!options.tls },
      "ping by e-mail listening",
    )
  })
}

export function stopInboundEmail(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve()
    server.close(() => resolve())
    server = undefined
  })
}

/** Options from the environment, or null when ping by e-mail is off. */
export function inboundEmailOptions(env: {
  INBOUND_SMTP_PORT?: number | undefined
  INBOUND_SMTP_HOST: string
  INBOUND_EMAIL_DOMAIN?: string | undefined
  INBOUND_SMTP_TLS_CERT?: string | undefined
  INBOUND_SMTP_TLS_KEY?: string | undefined
}): InboundEmailOptions | null {
  if (!env.INBOUND_SMTP_PORT || !env.INBOUND_EMAIL_DOMAIN) return null
  return {
    port: env.INBOUND_SMTP_PORT,
    host: env.INBOUND_SMTP_HOST,
    domain: env.INBOUND_EMAIL_DOMAIN.toLowerCase(),
    tls:
      env.INBOUND_SMTP_TLS_CERT && env.INBOUND_SMTP_TLS_KEY
        ? {
            cert: readFileSync(env.INBOUND_SMTP_TLS_CERT, "utf8"),
            key: readFileSync(env.INBOUND_SMTP_TLS_KEY, "utf8"),
          }
        : undefined,
  }
}
