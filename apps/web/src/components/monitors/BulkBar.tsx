import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/shared/Button"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { useToast } from "@/components/shared/Toast"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

type Action =
  | { action: "pause" | "resume" | "delete" }
  | { action: "mute"; minutes: number | null }
  | { action: "addTag" | "removeTag"; tag: string }

const control =
  "min-h-9 rounded-md border border-line-strong bg-ground px-3 text-sm text-ink placeholder:text-dim focus-visible:outline-2 disabled:opacity-50"

/** Actions for the monitors selected in the table. */
export function BulkBar({
  ids,
  onDone,
}: {
  ids: string[]
  /** Called after a request, with the ids that did not fail (so they can be deselected). */
  onDone: (succeeded: string[], failed: string[]) => void
}) {
  const { t } = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [tag, setTag] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(req: Action) {
    setBusy(true)
    try {
      const res = await api.monitors.bulk({ ids, ...req })
      const failed = res.failed.map((f) => f.id)
      onDone(
        ids.filter((id) => !failed.includes(id)),
        failed,
      )
      await queryClient.invalidateQueries()
      toast(
        failed.length
          ? t("bulk.partial", { ok: res.succeeded, failed: failed.length })
          : t("bulk.done", { count: res.succeeded }),
        failed.length ? "error" : "success",
      )
      if (req.action === "addTag" || req.action === "removeTag") setTag("")
    } catch {
      toast(t("bulk.failed"), "error")
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  const cleanTag = tag.trim()
  return (
    <section
      aria-label={t("bulk.region")}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3 shadow-[var(--shadow-card)]"
    >
      <span className="mr-2 text-sm font-semibold" aria-live="polite">
        {t("bulk.selected", { count: ids.length })}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => run({ action: "pause" })}
      >
        {t("bulk.pause")}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => run({ action: "resume" })}
      >
        {t("bulk.resume")}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => run({ action: "mute", minutes: 60 })}
      >
        {t("bulk.mute")}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => run({ action: "mute", minutes: null })}
      >
        {t("bulk.unmute")}
      </Button>
      <span className="ml-2 flex items-center gap-2">
        <label className="sr-only" htmlFor="bulk-tag">
          {t("bulk.tag")}
        </label>
        <input
          id="bulk-tag"
          value={tag}
          maxLength={64}
          onChange={(e) => setTag(e.target.value)}
          placeholder={t("bulk.tag")}
          className={`${control} w-36`}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !cleanTag}
          onClick={() => run({ action: "addTag", tag: cleanTag })}
        >
          {t("bulk.addTag")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !cleanTag}
          onClick={() => run({ action: "removeTag", tag: cleanTag })}
        >
          {t("bulk.removeTag")}
        </Button>
      </span>
      <Button
        size="sm"
        variant="danger"
        className="ml-auto"
        disabled={busy}
        onClick={() => setConfirmDelete(true)}
      >
        {t("bulk.delete")}
      </Button>

      <ConfirmModal
        open={confirmDelete}
        title={t("bulk.deleteTitle")}
        message={t("bulk.deleteMessage", { count: ids.length })}
        confirmLabel={t("bulk.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={() => void run({ action: "delete" })}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  )
}
