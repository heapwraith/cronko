import type { MonitorStatus } from "@cronko/shared/types"
import { useT } from "@/lib/i18n"
import { statusKey } from "@/lib/status"
import { Stamp } from "./Stamp"

export function StatusBadge({ status, label }: { status: MonitorStatus; label?: string }) {
  const { t } = useT()
  return <Stamp tone={status} label={label ?? t(statusKey(status))} />
}
