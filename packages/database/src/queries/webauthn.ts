import { and, eq } from "drizzle-orm"
import { db } from "../index"
import { webauthnCredentials } from "../schema"

export type WebauthnCredentialRow = typeof webauthnCredentials.$inferSelect

export async function listWebauthnCredentials(userId: string): Promise<WebauthnCredentialRow[]> {
  return db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId))
    .orderBy(webauthnCredentials.createdAt)
    .all()
}

export async function findWebauthnCredential(userId: string, id: string) {
  return db
    .select()
    .from(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, userId)))
    .get()
}

export async function createWebauthnCredential(input: {
  id: string
  userId: string
  name: string
  publicKey: string
  counter: number
  transports: string[] | null
}) {
  await db.insert(webauthnCredentials).values({ ...input, createdAt: new Date() })
}

/** Record a successful use; the counter only ever moves forward. */
export async function touchWebauthnCredential(id: string, counter: number) {
  await db
    .update(webauthnCredentials)
    .set({ counter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.id, id))
}

export async function deleteWebauthnCredential(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, userId)))
    .returning({ id: webauthnCredentials.id })
  return rows.length > 0
}

export async function deleteAllWebauthnCredentials(userId: string) {
  await db.delete(webauthnCredentials).where(eq(webauthnCredentials.userId, userId))
}

/** Credential ids are unique across all users: the same key cannot be registered twice. */
export async function webauthnCredentialExists(id: string): Promise<boolean> {
  return !!db
    .select({ id: webauthnCredentials.id })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.id, id))
    .get()
}
