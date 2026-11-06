import { formatRelativeTime } from "@cronko/shared/utils"
import { formatRunDuration } from "@/lib/format"
import { useT } from "@/lib/i18n"

export interface Run {
  id: string
  receivedAt: string
  sourceIp: string | null
  durationMs: number | null
  exitCode: number | null
  body?: string | null
}

/** Internal marker written by the finish pulse; it is not job output. */
export function runOutput(run: Pick<Run, "body">): string | null {
  const body = run.body?.trim()
  return body && body !== "pulse:finish" ? body : null
}

const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-dim"
const td = "px-3 py-2.5 align-top"

/** One row per run; output opens inline, so a failed run explains itself. */
export function RunHistory({ runs, caption }: { runs: Run[]; caption: string }) {
  const { t, locale } = useT()

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
      <table className="w-full min-w-[22rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line-strong bg-raised">
          <tr>
            <th scope="col" className={th}>
              {t("detail.when")}
            </th>
            <th scope="col" className={th}>
              {t("board.duration")}
            </th>
            <th scope="col" className={th}>
              {t("board.exit")}
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              {t("detail.source")}
            </th>
            <th scope="col" className={th}>
              {t("detail.output")}
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const output = runOutput(run)
            const failed = run.exitCode != null && run.exitCode !== 0
            return (
              <tr key={run.id} className="border-b border-line last:border-b-0">
                <td className={td}>
                  <time dateTime={run.receivedAt} className="font-mono text-xs tnum">
                    {new Date(run.receivedAt).toLocaleString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <span className="ml-2 hidden text-dim sm:inline">
                    {formatRelativeTime(new Date(run.receivedAt), locale)}
                  </span>
                </td>
                <td className={`${td} font-mono text-dim tnum`}>
                  {formatRunDuration(run.durationMs)}
                </td>
                <td
                  className={`${td} font-mono tnum ${failed ? "font-semibold text-failed" : "text-dim"}`}
                >
                  {run.exitCode ?? "—"}
                </td>
                <td className={`${td} hidden font-mono text-xs text-dim md:table-cell`}>
                  {run.sourceIp ?? "—"}
                </td>
                <td className={td}>
                  {output ? (
                    <details>
                      <summary className="cursor-pointer text-signal-text underline-offset-4 hover:underline">
                        {t("detail.showOutput")}
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-ground p-3 font-mono text-xs">
                        {output}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-dim">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
