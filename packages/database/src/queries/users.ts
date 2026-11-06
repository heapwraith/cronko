import { eq } from "drizzle-orm"
import { db } from "../index"
import { users } from "../schema"

export async function findUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).get()
}

export async function createUser(input: { email: string; passwordHash: string }) {
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email: input.email,
    password: input.passwordHash,
    createdAt: new Date(),
  })
}
