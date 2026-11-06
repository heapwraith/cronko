import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router"
import { MonitorEditForm } from "@/components/monitors/MonitorEditForm"
import { api } from "@/lib/api"
import NotFound from "@/pages/NotFound"

export default function EditMonitorPage() {
  const { id = "" } = useParams()
  const {
    data: monitor,
    error,
    isPending,
  } = useQuery({
    queryKey: ["monitor", id],
    queryFn: () => api.monitors.get(id),
  })

  if (isPending) return null
  if (error || !monitor) return <NotFound />

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-zinc-100">Edit Monitor</h1>
      <MonitorEditForm monitor={monitor} />
    </div>
  )
}
