import type { Context } from "hono"
import { setCookie } from "hono/cookie"
import { env } from "../env"
import { generateAccessToken, generateRefreshToken } from "./auth"

const ACCESS_SECONDS = 15 * 60
const REFRESH_SECONDS = 7 * 24 * 60 * 60

/** Set the access and refresh cookies for a user who has passed every required factor. */
export async function setSessionCookies(c: Context, user: { id: string; email: string }) {
  const accessToken = await generateAccessToken(user.id, user.email)
  const refreshToken = await generateRefreshToken(user.id, user.email)
  const secure = env.NODE_ENV === "production"

  setCookie(c, "cronko_token", accessToken, {
    httpOnly: true,
    secure,
    sameSite: "Strict",
    path: "/",
    maxAge: ACCESS_SECONDS,
  })
  setCookie(c, "cronko_refresh", refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "Strict",
    path: "/",
    maxAge: REFRESH_SECONDS,
  })

  return {
    accessToken,
    expiresAt: new Date((Math.floor(Date.now() / 1000) + ACCESS_SECONDS) * 1000).toISOString(),
  }
}
