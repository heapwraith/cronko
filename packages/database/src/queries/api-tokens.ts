import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "../index"
import { apiTokens } from "../schema"

type NewApiToken = typeof apiTokens.$inferInsert

export async function createApiToken(input: NewApiToken) {
  await db.insert(apiTokens).values(input)
}

export async function listApiTokens(userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scope: apiTokens.scope,
      expiresAt: apiTokens.expiresAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
    .all()
}

export async function findApiTokenByHash(tokenHash: string) {
  return db.select().from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)).get()
}

export async function findApiToken(id: string, userId: string) {
  return db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .get()
}

/** Revoke a token the user owns; false when it does not exist or is already revoked. */
export async function revokeApiToken(id: string, userId: string): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id })
  return rows.length > 0
}

export async function touchApiToken(id: string, at: Date) {
  await db.update(apiTokens).set({ lastUsedAt: at }).where(eq(apiTokens.id, id))
}
