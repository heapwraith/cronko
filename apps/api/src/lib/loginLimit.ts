/** Failed-attempt limiter shared by the password step, the 2FA step and 2FA management. */
const loginStore = new Map<string, { count: number; resetAt: number }>()
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of loginStore) {
    if (now >= entry.resetAt) loginStore.delete(key)
  }
}, 60_000).unref()

export const loginKey = (ip: string, email: string) => `${ip}:${email.toLowerCase()}`

/** Blocked once MAX_LOGIN_ATTEMPTS failures happened inside the window. */
export function isLoginBlocked(key: string): boolean {
  const entry = loginStore.get(key)
  return !!entry && Date.now() < entry.resetAt && entry.count >= MAX_LOGIN_ATTEMPTS
}

/** Only failures count: signing in correctly must never lock you out. */
export function recordLoginFailure(key: string) {
  const now = Date.now()
  const entry = loginStore.get(key)
  if (entry && now < entry.resetAt) entry.count++
  else loginStore.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
}

/** A correct full sign-in resets the counter. */
export function clearLoginFailures(key: string) {
  loginStore.delete(key)
}
