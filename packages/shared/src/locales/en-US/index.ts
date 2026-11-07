import { auth } from "./auth"
import { core } from "./core"
import { howto } from "./howto"
import { monitors } from "./monitors"
import { notifications } from "./notifications"
import { settings } from "./settings"
import { status } from "./status"

export const enUS = {
  ...core,
  ...monitors,
  ...notifications,
  ...settings,
  ...auth,
  ...status,
  ...howto,
} as const
