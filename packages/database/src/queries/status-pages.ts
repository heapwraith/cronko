import { asc, eq } from "drizzle-orm"
import { db } from "../index"
import { statusPages } from "../schema"

export type StatusPage = typeof statusPages.$inferSelect

export async function findAllStatusPages(): Promise<StatusPage[]> {
  return db.select().from(statusPages).orderBy(asc(statusPages.title)).all()
}

export async function findStatusPageById(id: string): Promise<StatusPage | undefined> {
  return db.select().from(statusPages).where(eq(statusPages.id, id)).get()
}

export async function findStatusPageBySlug(slug: string): Promise<StatusPage | undefined> {
  return db.select().from(statusPages).where(eq(statusPages.slug, slug)).get()
}

export async function createStatusPage(input: {
  id: string
  slug: string
  title: string
  description?: string | null
  tag: string
  enabled?: boolean
  now: Date
}): Promise<StatusPage> {
  await db.insert(statusPages).values({
    id: input.id,
    slug: input.slug,
    title: input.title,
    description: input.description ?? null,
    tag: input.tag,
    enabled: input.enabled ?? false,
    createdAt: input.now,
    updatedAt: input.now,
  })
  const created = await findStatusPageById(input.id)
  if (!created) throw new Error(`status page ${input.id} missing after insert`)
  return created
}

export async function updateStatusPage(
  id: string,
  input: Partial<Pick<StatusPage, "slug" | "title" | "description" | "tag" | "enabled">> & {
    now: Date
  },
): Promise<StatusPage | undefined> {
  const { now, ...fields } = input
  await db
    .update(statusPages)
    .set({ ...fields, updatedAt: now })
    .where(eq(statusPages.id, id))
  return findStatusPageById(id)
}

export async function deleteStatusPage(id: string): Promise<boolean> {
  if (!(await findStatusPageById(id))) return false
  await db.delete(statusPages).where(eq(statusPages.id, id))
  return true
}
