import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate, useParams } from "react-router"
import { MonitorForm } from "@/components/monitors/MonitorForm"
import { Breadcrumb } from "@/components/shared/Breadcrumb"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"
import NotFound from "@/pages/NotFound"

export default function EditMonitorPage() {
  const { t } = useT()
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    data: monitor,
    error: loadError,
    isPending,
  } = useQuery({ queryKey: ["monitor", id], queryFn: () => api.monitors.get(id) })

  if (isPending) return null
  if (loadError || !monitor) return <NotFound />

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: t("nav.dashboard"), href: "/dashboard" },
          { label: t("nav.monitors"), href: "/monitors" },
          { label: monitor.name, href: `/monitors/${id}` },
          { label: t("monitors.edit") },
        ]}
      />
      <h1 className="text-2xl font-bold tracking-tight">{t("monitors.edit")}</h1>

      <MonitorForm
        initial={monitor}
        submitLabel={submitting ? t("monitors.saving") : t("monitors.saveChanges")}
        submitting={submitting}
        error={error}
        onCancel={() => navigate(`/monitors/${id}`)}
        onSubmit={async (input) => {
          setSubmitting(true)
          setError(null)
          try {
            await api.monitors.update(id, input)
            await queryClient.invalidateQueries()
            toast(t("monitors.saved"), "success")
            navigate(`/monitors/${id}`)
          } catch {
            setError(t("monitors.failedSave"))
            setSubmitting(false)
          }
        }}
      />
    </div>
  )
}
