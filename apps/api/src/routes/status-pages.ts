import {
  createStatusPage,
  deleteStatusPage,
  findAllStatusPages,
  findStatusPageBySlug,
  updateStatusPage,
} from "@cronko/database/queries/status-pages"
import { STATUS_SLUG_PATTERN } from "@cronko/shared/status"
import { normalizeTag, TAG_PATTERN } from "@cronko/shared/tags"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { z } from "zod"
import { logAuditEvent } from "../services/audit"

/** Admin side of status pages (authenticated, under /api). */
export const statusPagesRoute = new Hono()

const slug = z.string().trim().toLowerCase().regex(STATUS_SLUG_PATTERN, "Use a-z, 0-9 and -")
const tag = z
  .string()
  .transform(normalizeTag)
  .refine((t) => TAG_PATTERN.test(t), "Invalid tag")
const fields = {
  slug,
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).nullable().optional(),
  tag,
  enabled: z.boolean().optional(),
}

const userId = (c: { get: (k: "jwtPayload") => unknown }) =>
  (c.get("jwtPayload") as { sub: string })?.sub

statusPagesRoute.get("/", async (c) => c.json({ data: await findAllStatusPages() }))

statusPagesRoute.post("/", zValidator("json", z.object(fields)), async (c) => {
  const body = c.req.valid("json")
  if (await findStatusPageBySlug(body.slug)) {
    return c.json({ error: "Slug already in use", code: "CONFLICT" }, 409)
  }
  const page = await createStatusPage({
    id: crypto.randomUUID(),
    slug: body.slug,
    title: body.title,
    description: body.description || null,
    tag: body.tag,
    ...(body.enabled !== undefined && { enabled: body.enabled }),
    now: new Date(),
  })
  logAuditEvent({
    userId: userId(c),
    action: "status_page.created",
    resourceType: "status_page",
    resourceId: page.id,
    metadata: { slug: page.slug, tag: page.tag, enabled: page.enabled },
  }).catch(() => {})
  return c.json({ data: page }, 201)
})

statusPagesRoute.patch("/:id", zValidator("json", z.object(fields).partial()), async (c) => {
  const id = c.req.param("id")
  const body = c.req.valid("json")
  if (body.slug) {
    const other = await findStatusPageBySlug(body.slug)
    if (other && other.id !== id) {
      return c.json({ error: "Slug already in use", code: "CONFLICT" }, 409)
    }
  }
  const page = await updateStatusPage(id, {
    ...(body.slug !== undefined && { slug: body.slug }),
    ...(body.title !== undefined && { title: body.title }),
    ...(body.description !== undefined && { description: body.description || null }),
    ...(body.tag !== undefined && { tag: body.tag }),
    ...(body.enabled !== undefined && { enabled: body.enabled }),
    now: new Date(),
  })
  if (!page) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  logAuditEvent({
    userId: userId(c),
    action: "status_page.updated",
    resourceType: "status_page",
    resourceId: id,
    metadata: body,
  }).catch(() => {})
  return c.json({ data: page })
})

statusPagesRoute.delete("/:id", async (c) => {
  const id = c.req.param("id")
  if (!(await deleteStatusPage(id))) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  logAuditEvent({
    userId: userId(c),
    action: "status_page.deleted",
    resourceType: "status_page",
    resourceId: id,
  }).catch(() => {})
  return c.json({ data: { ok: true } })
})
