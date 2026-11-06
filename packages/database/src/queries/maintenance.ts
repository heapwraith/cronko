import { asc, eq } from "drizzle-orm"
import { db } from "../index"
import { maintenanceWindows } from "../schema"

export type MaintenanceWindow = typeof maintenanceWindows.$inferSelect
type Fields = Omit<MaintenanceWindow, "id" | "createdAt" | "updatedAt">

export async function findAllMaintenanceWindows(): Promise<MaintenanceWindow[]> {
  return db.select().from(maintenanceWindows).orderBy(asc(maintenanceWindows.name)).all()
}

export async function findEnabledMaintenanceWindows(): Promise<MaintenanceWindow[]> {
  return db.select().from(maintenanceWindows).where(eq(maintenanceWindows.enabled, true)).all()
}

export async function findMaintenanceWindowById(id: string) {
  return db.select().from(maintenanceWindows).where(eq(maintenanceWindows.id, id)).get()
}

export async function createMaintenanceWindow(input: Fields & { id: string; now: Date }) {
  const { now, ...fields } = input
  await db.insert(maintenanceWindows).values({ ...fields, createdAt: now, updatedAt: now })
  const created = await findMaintenanceWindowById(input.id)
  if (!created) throw new Error(`maintenance window ${input.id} missing after insert`)
  return created
}

export async function updateMaintenanceWindow(id: string, input: Partial<Fields> & { now: Date }) {
  const { now, ...fields } = input
  await db
    .update(maintenanceWindows)
    .set({ ...fields, updatedAt: now })
    .where(eq(maintenanceWindows.id, id))
  return findMaintenanceWindowById(id)
}

export async function deleteMaintenanceWindow(id: string): Promise<boolean> {
  if (!(await findMaintenanceWindowById(id))) return false
  await db.delete(maintenanceWindows).where(eq(maintenanceWindows.id, id))
  return true
}
