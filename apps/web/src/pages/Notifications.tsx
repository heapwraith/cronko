import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, Plus, Send, Trash2 } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { ChannelFields } from "@/components/notifications/ChannelFields"
import {
  CHANNEL_TYPES,
  CHANNELS,
  type Channel,
  channelMeta,
  serverFieldErrors,
  validateConfig,
} from "@/components/notifications/channels"
import { DeliveryLog } from "@/components/notifications/DeliveryLog"
import { Button } from "@/components/shared/Button"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { EmptyState } from "@/components/shared/EmptyState"
import { IconButton } from "@/components/shared/IconButton"
import { SkeletonTable } from "@/components/shared/Skeleton"
import { useToast } from "@/components/shared/Toast"
import { Toggle } from "@/components/shared/Toggle"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"

const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-dim"
const td = "px-3 py-4 align-middle"

type Draft = { type: string; name: string; values: Record<string, string> }
const emptyDraft: Draft = { type: "discord", name: "", values: {} }

function stringConfig(config: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v ?? "")]))
}

export default function NotificationsPage() {
  const { t } = useT()
  const { toast } = useToast()
  const qc = useQueryClient()
  const typeId = useId()

  const {
    data: channels = [],
    isPending,
    error,
  } = useQuery({ queryKey: ["channels"], queryFn: () => api.notifications.list() })

  useEffect(() => {
    if (error) toast(t("notifications.failedUpdate"), "error")
  }, [error, toast, t])

  const refresh = () => qc.invalidateQueries({ queryKey: ["channels"] })

  // One draft drives both "add" and "edit": editingId === null means adding.
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Channel | null>(null)

  function openAdd() {
    setEditingId(null)
    setDraft(emptyDraft)
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(ch: Channel) {
    setEditingId(ch.id)
    setDraft({ type: ch.type, name: ch.name, values: stringConfig(ch.config) })
    setErrors({})
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
  }

  function setValue(key: string, v: string) {
    setDraft((d) => ({ ...d, values: { ...d.values, [key]: v } }))
    setErrors((e) => ({ ...e, [key]: "" }))
  }

  async function save() {
    const found = validateConfig(draft.type, draft.values)
    const translated = Object.fromEntries(
      Object.entries(found).map(([k, code]) => [k, t(`notifications.err.${code}`)]),
    )
    const nameMissing = !draft.name.trim() && editingId !== null
    if (nameMissing) translated.name = t("notifications.err.required")
    setErrors(translated)
    if (Object.keys(translated).length > 0) return

    const config = Object.fromEntries(
      channelMeta(draft.type).fields.map((f) => [f.key, (draft.values[f.key] ?? "").trim()]),
    )
    setSaving(true)
    try {
      if (editingId) {
        await api.notifications.update(editingId, { name: draft.name.trim(), config })
        toast(t("notifications.channelUpdated"), "success")
      } else {
        await api.notifications.create({
          name: draft.name.trim() || channelMeta(draft.type).label,
          type: draft.type,
          config,
        })
        toast(t("notifications.channelCreated"), "success")
      }
      await refresh()
      closeForm()
    } catch (e) {
      const fromServer = e instanceof ApiError && e.status === 400 ? serverFieldErrors(e.body) : {}
      if (Object.keys(fromServer).length > 0) setErrors(fromServer)
      else
        toast(t(editingId ? "notifications.failedUpdate" : "notifications.failedCreate"), "error")
    } finally {
      setSaving(false)
    }
  }

  async function toggle(ch: Channel) {
    try {
      await api.notifications.update(ch.id, { enabled: !ch.enabled })
      await refresh()
    } catch {
      toast(t("notifications.failedUpdate"), "error")
    }
  }

  async function test(ch: Channel) {
    setTestingId(ch.id)
    try {
      await api.notifications.test(ch.id)
      toast(t("notifications.testSent"), "success")
    } catch {
      toast(t("notifications.testFailed"), "error")
    } finally {
      setTestingId(null)
      // The test goes through the outbox's log; show it right away.
      qc.invalidateQueries({ queryKey: ["deliveries"] })
    }
  }

  async function remove() {
    if (!toDelete) return
    try {
      await api.notifications.delete(toDelete.id)
      toast(t("notifications.deleted"), "success")
      await refresh()
    } catch {
      toast(t("notifications.failedDelete"), "error")
    } finally {
      setToDelete(null)
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl leading-tight">{t("notifications.title")}</h1>
          {!formOpen && (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("notifications.addChannel")}
            </Button>
          )}
        </div>

        {formOpen && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
            noValidate
            aria-label={editingId ? t("notifications.edit") : t("notifications.addChannel")}
            className="space-y-4 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]"
          >
            {editingId === null && (
              <div className="max-w-xs">
                <label htmlFor={typeId} className="mb-1.5 block text-sm font-medium text-ink">
                  {t("notifications.type")}
                </label>
                <select
                  id={typeId}
                  value={draft.type}
                  onChange={(e) => {
                    setDraft({ type: e.target.value, name: draft.name, values: {} })
                    setErrors({})
                  }}
                  className="min-h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink focus-visible:outline-2"
                >
                  {CHANNEL_TYPES.map((k) => (
                    <option key={k} value={k}>
                      {CHANNELS[k].label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <ChannelFields
              type={draft.type}
              name={draft.name}
              onName={(v) => {
                setDraft((d) => ({ ...d, name: v }))
                setErrors((e) => ({ ...e, name: "" }))
              }}
              values={draft.values}
              onValue={setValue}
              errors={errors}
              namePlaceholder={channelMeta(draft.type).label}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving
                  ? t("notifications.creating")
                  : editingId
                    ? t("monitors.saveChanges")
                    : t("notifications.create")}
              </Button>
              <Button variant="secondary" onClick={closeForm} disabled={saving}>
                {t("notifications.cancelAdd")}
              </Button>
            </div>
          </form>
        )}

        {isPending ? (
          <SkeletonTable rows={3} cols={4} />
        ) : channels.length === 0 ? (
          !formOpen && (
            <EmptyState
              icon={Bell}
              title={t("notifications.noChannels")}
              description={t("notifications.noChannelsDesc")}
            />
          )
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
            <table className="w-full min-w-[20rem] border-collapse text-sm">
              <caption className="sr-only">{t("notifications.channelsCaption")}</caption>
              <thead className="border-b border-line-strong bg-raised">
                <tr>
                  <th scope="col" className={th}>
                    {t("notifications.name")}
                  </th>
                  <th scope="col" className={`${th} hidden sm:table-cell`}>
                    {t("notifications.type")}
                  </th>
                  <th scope="col" className={th}>
                    {t("notifications.enabled")}
                  </th>
                  <th scope="col" className={th}>
                    <span className="sr-only">{t("board.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => (
                  <tr
                    key={ch.id}
                    className={`border-b border-line last:border-b-0 transition-colors hover:bg-raised ${
                      ch.enabled ? "" : "text-dim"
                    }`}
                  >
                    <th scope="row" className={`${td} text-left font-semibold`}>
                      {ch.name}
                    </th>
                    <td className={`${td} hidden text-dim sm:table-cell`}>
                      {channelMeta(ch.type).label}
                    </td>
                    <td className={td}>
                      <Toggle
                        hideLabel
                        label={`${t("notifications.enabled")}: ${ch.name}`}
                        checked={ch.enabled}
                        onChange={() => void toggle(ch)}
                      />
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(ch)}
                          aria-label={`${t("notifications.edit")}: ${ch.name}`}
                        >
                          {t("notifications.edit")}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={testingId === ch.id || !ch.enabled}
                          onClick={() => void test(ch)}
                          aria-label={`${t("notifications.test")}: ${ch.name}`}
                        >
                          <Send className="h-3 w-3" aria-hidden="true" />
                          {testingId === ch.id
                            ? t("notifications.testing")
                            : t("notifications.test")}
                        </Button>
                        <IconButton
                          label={`${t("notifications.remove")}: ${ch.name}`}
                          onClick={() => setToDelete(ch)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DeliveryLog />

      <ConfirmModal
        open={!!toDelete}
        onCancel={() => setToDelete(null)}
        title={t("notifications.deleteTitle")}
        message={t("notifications.deleteMessage", { name: toDelete?.name ?? "" })}
        confirmLabel={t("monitors.delete")}
        cancelLabel={t("monitors.cancel")}
        variant="danger"
        onConfirm={() => void remove()}
      />
    </div>
  )
}
