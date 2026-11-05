import { notFound } from "next/navigation"
import { MonitorEditForm } from "@/components/monitors/MonitorEditForm"
import { api } from "@/lib/api"

export default async function EditMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let monitor: {
    id: string
    name: string
    expectedIntervalSeconds: number
    gracePeriodSeconds: number
  } | null = null

  try {
    const data = await api.monitors.get(id)
    monitor = data
  } catch (e) {
    console.error("Failed to load monitor for edit:", e)
  }

  if (!monitor) {
    notFound()
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-zinc-100">Edit Monitor</h1>
      <MonitorEditForm monitor={monitor} />
    </div>
  )
}
