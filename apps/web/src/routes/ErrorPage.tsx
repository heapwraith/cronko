import { useNavigate, useRouteError } from "react-router"
import { Button } from "@/components/shared/Button"
import { useT } from "@/lib/i18n"

export function ErrorPage() {
  const { t } = useT()
  const error = useRouteError()
  const navigate = useNavigate()
  // biome-ignore lint/suspicious/noConsole: dev-only diagnostics
  if (import.meta.env.DEV) console.error(error)

  return (
    <div role="alert" className="flex flex-col items-center justify-center py-16 text-center">
      <h1 className="text-lg font-semibold">{t("error.title")}</h1>
      <p className="mt-1 max-w-sm text-sm text-dim">{t("error.body")}</p>
      <Button className="mt-5" onClick={() => navigate(0)}>
        {t("error.retry")}
      </Button>
    </div>
  )
}
