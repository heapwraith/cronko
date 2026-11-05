import pino from "pino"
import { env } from "../env"

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  ...(env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  }),
  redact: ["req.headers.authorization", "req.headers.cookie"],
})
