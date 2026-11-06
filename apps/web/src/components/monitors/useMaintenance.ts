import { activeMaintenanceUntil } from "@cronko/shared/maintenance"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"

/** For each monitor, the end of the maintenance window covering it now (if any). */
export function useMaintenance() {
  const { data: windows = [] } = useQuery({
    queryKey: ["maintenance"],
    queryFn: () => api.maintenance.list(),
    refetchInterval: 60_000,
  })
  return (monitor: { id: string; tags?: readonly string[] | null }): Date | null =>
    activeMaintenanceUntil(windows, monitor, new Date())
}
