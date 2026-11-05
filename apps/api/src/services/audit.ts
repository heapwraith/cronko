import { db } from "@cronko/database"
import { auditLogs } from "@cronko/database/schema"
import { logger } from "../lib/logger"

interface AuditEvent {
  userId?: string
  action: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: event.userId ?? null,
      action: event.action,
      resourceType: event.resourceType ?? null,
      resourceId: event.resourceId ?? null,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      ipAddress: event.ipAddress ?? null,
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err, event }, "audit log insert failed")
  }
}
