import { formatRelativeTime } from "@cronko/shared/utils"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useId, useState } from "react"
import { SkeletonTable } from "@/components/shared/Skeleton"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

type Delivery = Awaited<ReturnType<typeof api.notifications.deliveries>>[number]

const CHIP: Record<Delivery["status"], string> = {
  sent: "bg-[var(--chip-healthy-bg)] text-[var(--chip-healthy-fg)]",
  pending: "bg-[var(--chip-pending-bg)] text-[var(--chip-pending-fg)]",
  failed: "bg-[var(--chip-failed-bg)] text-[var(--chip-failed-fg)]",
}

const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-dim"
const td = "px-3 py-3 align-top"

/**
 * Outbox history: a lost alert is the worst failure Cronko has, so failed and
 * retrying deliveries are surfaced with their error instead of hidden in logs.
 */
export function DeliveryLog() {
  const { t, locale } = useT()
  const { toast } = useToast()
  const filterId = useId()
  const [onlyFailures, setOnlyFailures] = useState(false)

  const {
    data: rows = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["deliveries"],
    queryFn: () => api.notifications.deliveries(100),
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (error) toast(t("notifications.failedLoadDeliveries"), "error")
  }, [error, toast, t])

  const failing = rows.filter((r) => r.status === "failed" || r.lastError).length
  const shown = onlyFailures ? rows.filter((r) => r.status !== "sent") : rows

  return (
    <section aria-labelledby={`${filterId}-h`} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={`${filterId}-h`} className="text-lg font-semibold tracking-tight">
          {t("notifications.deliveries")}
        </h2>
        <label
          htmlFor={filterId}
          className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink"
        >
          <input
            id={filterId}
            type="checkbox"
            checked={onlyFailures}
            onChange={(e) => setOnlyFailures(e.target.checked)}
            className="h-4 w-4 accent-[var(--signal)]"
          />
          {t("notifications.onlyFailures")}
          {failing > 0 && <span className="font-mono text-failed tnum">({failing})</span>}
        </label>
      </div>

      {isPending ? (
        <SkeletonTable rows={4} cols={5} />
      ) : shown.length === 0 ? (
        <p className="rounded-[6px] border border-line bg-panel py-8 text-center text-sm text-dim">
          {t("notifications.deliveriesEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[6px] border border-line bg-panel">
          <table className="w-full min-w-[20rem] border-collapse text-sm">
            <caption className="sr-only">{t("notifications.deliveriesCaption")}</caption>
            <thead className="border-b-2 border-line-strong">
              <tr>
                <th scope="col" className={th}>
                  {t("notifications.colWhen")}
                </th>
                <th scope="col" className={th}>
                  {t("notifications.colMonitor")}
                </th>
                <th scope="col" className={`${th} hidden sm:table-cell`}>
                  {t("notifications.colChannel")}
                </th>
                <th scope="col" className={`${th} hidden md:table-cell`}>
                  {t("notifications.colEvent")}
                </th>
                <th scope="col" className={th}>
                  {t("notifications.colStatus")}
                </th>
                <th scope="col" className={`${th} hidden md:table-cell`}>
                  {t("notifications.colAttempts")}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr
                  key={d.id}
                  className={`border-b border-line last:border-b-0 ${
                    d.status === "failed"
                      ? "bg-[color-mix(in_oklch,var(--st-failed)_9%,transparent)]"
                      : ""
                  }`}
                >
                  <td className={`${td} whitespace-nowrap text-dim`}>
                    <time
                      dateTime={d.createdAt}
                      title={new Date(d.createdAt).toLocaleString(locale)}
                    >
                      {formatRelativeTime(new Date(d.createdAt), locale)}
                    </time>
                  </td>
                  <th scope="row" className={`${td} text-left font-semibold`}>
                    {d.monitorName}
                    {d.lastError && (
                      <span className="mt-1 block max-w-prose break-words font-mono text-xs font-normal text-failed">
                        {d.lastError}
                      </span>
                    )}
                  </th>
                  <td className={`${td} hidden text-dim sm:table-cell`}>{d.channelName}</td>
                  <td className={`${td} hidden md:table-cell`}>
                    {t(`notifications.event.${d.event}`)}
                  </td>
                  <td className={td}>
                    <span
                      className={`inline-block rounded-[4px] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${CHIP[d.status]}`}
                    >
                      {t(`notifications.status.${d.status}`)}
                    </span>
                  </td>
                  <td className={`${td} hidden font-mono text-dim tnum md:table-cell`}>
                    {d.attempts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
