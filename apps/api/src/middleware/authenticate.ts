import type { Context, Next } from "hono"
import { getCookie } from "hono/cookie"
import { verifyAccessToken } from "../services/auth"

export async function authenticate(c: Context, next: Next) {
  let token: string | undefined

  const header = c.req.header("Authorization")
  if (header?.startsWith("Bearer ")) {
    token = header.slice(7)
  } else {
    token = getCookie(c, "cronko_token")
  }

  if (!token) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
  }

  try {
    const payload = await verifyAccessToken(token)
    c.set("jwtPayload", payload)
  } catch {
    return c.json({ error: "Token expired or invalid", code: "UNAUTHORIZED" }, 401)
  }

  await next()
}
