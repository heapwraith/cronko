import { eq, lt } from "drizzle-orm"
import { db } from "../index"
import { revokedTokens } from "../schema"

/** Deny a session token until its own expiry; also drops rows that no longer matter. */
export async function revokeToken(jti: string, expiresAt: Date) {
  await db.delete(revokedTokens).where(lt(revokedTokens.expiresAt, new Date()))
  await db.insert(revokedTokens).values({ jti, expiresAt }).onConflictDoNothing()
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  const row = await db.select().from(revokedTokens).where(eq(revokedTokens.jti, jti)).get()
  return !!row
}
