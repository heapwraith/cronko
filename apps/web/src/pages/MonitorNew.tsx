import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate } from "react-router"
import { MonitorForm } from "@/components/monitors/MonitorForm"
import { Breadcrumb } from "@/components/shared/Breadcrumb"
import { useToast } from "@/components/shared/Toast"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"

export default function NewMonitorPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: t("nav.dashboard"), href: "/dashboard" },
          { label: t("nav.monitors"), href: "/monitors" },
          { label: t("monitors.newMonitor") },
        ]}
      />
      <h1 className="text-2xl font-bold tracking-tight">{t("monitors.newMonitor")}</h1>

      <MonitorForm
        submitLabel={submitting ? t("monitors.creating") : t("monitors.create")}
        submitting={submitting}
        error={error}
        onCancel={() => navigate("/monitors")}
        onSubmit={async (input) => {
          setSubmitting(true)
          setError(null)
          try {
            const created = await api.monitors.create(input)
            await queryClient.invalidateQueries()
            toast(t("monitors.monitorCreated"), "success")
            navigate(`/monitors/${created.id}`)
          } catch (e) {
            setError(
              e instanceof ApiError && e.status === 409
                ? t("monitors.nameExists")
                : t("monitors.failedCreate"),
            )
            setSubmitting(false)
          }
        }}
      />
    </div>
  )
}
