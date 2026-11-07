import { and, eq, isNull, lt, or } from "drizzle-orm"
import { db } from "../index"
import { recoveryCodes, users } from "../schema"

export async function findUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).get()
}

export async function findUserById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).get()
}

export async function createUser(input: { email: string; passwordHash: string }) {
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email: input.email,
    password: input.passwordHash,
    createdAt: new Date(),
  })
}

/** Store a not-yet-confirmed TOTP secret. Refuses (false) when 2FA is already on. */
export async function setPendingTotpSecret(userId: string, encryptedSecret: string) {
  const res = db
    .update(users)
    .set({ totpSecret: encryptedSecret, totpLastStep: null })
    .where(and(eq(users.id, userId), isNull(users.totpEnabledAt)))
    .run()
  return res.changes === 1
}

/** Turn 2FA on and replace the recovery codes, atomically. */
export async function enableTotp(userId: string, step: number, codeHashes: string[]) {
  db.transaction((tx) => {
    tx.update(users)
      .set({ totpEnabledAt: new Date(), totpLastStep: step })
      .where(eq(users.id, userId))
      .run()
    tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId)).run()
    const now = new Date()
    for (const codeHash of codeHashes) {
      tx.insert(recoveryCodes)
        .values({ id: crypto.randomUUID(), userId, codeHash, createdAt: now })
        .run()
    }
  })
}

export async function disableTotp(userId: string) {
  db.transaction((tx) => {
    tx.update(users)
      .set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null })
      .where(eq(users.id, userId))
      .run()
    tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId)).run()
  })
}

/**
 * Accept a TOTP time step only if it is newer than the last one used, so a code
 * (even one intercepted live) works once. Atomic: the UPDATE is the check.
 */
export async function claimTotpStep(userId: string, step: number) {
  const res = db
    .update(users)
    .set({ totpLastStep: step })
    .where(and(eq(users.id, userId), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
    .run()
  return res.changes === 1
}

export async function listRecoveryCodes(userId: string) {
  return db.select().from(recoveryCodes).where(eq(recoveryCodes.userId, userId)).all()
}

/** Spend a recovery code; false when someone else already spent it. */
export async function consumeRecoveryCode(id: string) {
  const res = db.delete(recoveryCodes).where(eq(recoveryCodes.id, id)).run()
  return res.changes === 1
}
