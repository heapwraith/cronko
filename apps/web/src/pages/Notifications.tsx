import { Bell, ChevronRight, Mail, MessageSquare, Plus, Send, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { ConfirmModal } from "@/components/shared/ConfirmModal"
import { EmptyState } from "@/components/shared/EmptyState"
import { SkeletonList } from "@/components/shared/Skeleton"
import { useToast } from "@/components/shared/Toast"
import { Toggle } from "@/components/shared/Toggle"
import { ApiError, api } from "@/lib/api"
import { useT } from "@/lib/i18n"

const inputBase =
  "w-full rounded-lg border px-3 py-2 text-sm text-[#1a1f36] dark:text-zinc-100 placeholder:text-[#8e99a8] dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/40 transition-colors shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none"
const inputNormal = `${inputBase} border-[#dde0e4] dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:border-[#5e6ad2]/40`
const inputError = `${inputBase} border-red-400 dark:border-red-500 bg-red-50/30 dark:bg-red-950/10 focus:border-red-400 focus:ring-red-400/40`
const labelClass = "block text-xs font-medium text-[#697386] dark:text-zinc-500 mb-1.5"

type Channel = {
  id: string
  name: string
  type: string
  enabled: boolean
  config: Record<string, unknown>
  createdAt: string
}

const TYPE_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  discord: { icon: MessageSquare, label: "Discord", color: "text-[#5865F2]" },
  telegram: { icon: Send, label: "Telegram", color: "text-[#26A5E4]" },
  email: { icon: Mail, label: "Email", color: "text-[#697386]" },
  slack: { icon: MessageSquare, label: "Slack", color: "text-[#E01E5A]" },
}

const TYPE_OPTIONS = ["discord", "telegram", "email", "slack"] as const

type ZodIssue = { path: (string | number)[]; message: string }
type ZodErrorBody =
  | { error?: { issues?: ZodIssue[] } }
  | { success?: false; error?: { issues?: ZodIssue[] } }

function fieldLabel(type: string, path: string): string {
  const map: Record<string, string> = {
    "config.webhookUrl": "Webhook URL",
    "config.botToken": "Bot Token",
    "config.chatId": "Chat ID",
    "config.to": "Email",
    name: "Name",
  }
  return map[path] ?? path
}

function extractFieldErrors(errBody: unknown): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!errBody || typeof errBody !== "object") return errors
  const body = errBody as ZodErrorBody
  const issues = body?.error?.issues
  if (!Array.isArray(issues)) return errors
  for (const issue of issues) {
    const key = issue.path.join(".")
    if (!errors[key]) {
      const label = fieldLabel("", key)
      errors[key] = `${label}: ${issue.message}`
    }
  }
  return errors
}

function validateCreate(
  type: string,
  vals: { discordUrl: string; telegramToken: string; telegramChatId: string; emailTo: string },
): Record<string, string> {
  const errs: Record<string, string> = {}

  if (type === "discord") {
    if (!vals.discordUrl.trim()) errs["discordUrl"] = "Webhook URL is required"
    else if (
      !vals.discordUrl.startsWith("https://discord.com/api/webhooks/") &&
      !vals.discordUrl.startsWith("https://")
    ) {
      errs["discordUrl"] = "Must be a valid URL starting with https://"
    }
  }
  if (type === "telegram") {
    if (!vals.telegramToken.trim()) errs["telegramToken"] = "Bot Token is required"
    if (!vals.telegramChatId.trim()) errs["telegramChatId"] = "Chat ID is required"
  }
  if (type === "email") {
    if (!vals.emailTo.trim()) errs["emailTo"] = "Email is required"
    else if (!vals.emailTo.includes("@")) errs["emailTo"] = "Must be a valid email address"
  }

  return errs
}

function validateEdit(
  type: string,
  vals: { webhookUrl?: string; botToken?: string; chatId?: string; to?: string },
): Record<string, string> {
  const errs: Record<string, string> = {}

  if (type === "discord") {
    if (
      vals.webhookUrl &&
      !vals.webhookUrl.startsWith("https://discord.com/api/webhooks/") &&
      !vals.webhookUrl.startsWith("https://")
    ) {
      errs["webhookUrl"] = "Must be a valid URL starting with https://"
    }
  }
  if (type === "email") {
    if (vals.to && !vals.to.includes("@")) errs["to"] = "Must be a valid email address"
  }

  return errs
}

export default function NotificationsPage() {
  const { t } = useT()
  const { toast } = useToast()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editConfig, setEditConfig] = useState<Record<string, string>>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const [modalOpen, setModalOpen] = useState(false)
  const [ntype, setNtype] = useState("discord")
  const [nname, setNname] = useState("")
  const [discordUrl, setDiscordUrl] = useState("")
  const [telegramToken, setTelegramToken] = useState("")
  const [telegramChatId, setTelegramChatId] = useState("")
  const [emailTo, setEmailTo] = useState("")
  const [creating, setCreating] = useState(false)
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteLabel, setDeleteLabel] = useState("")
  const [testingId, setTestingId] = useState<string | null>(null)

  useEffect(() => {
    api.notifications
      .list()
      .then(setChannels)
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error("Failed to load notifications:", e)
      })
      .finally(() => setLoading(false))
  }, [])

  const refresh = async () => {
    const list = await api.notifications.list()
    setChannels(list)
  }

  async function handleCreate() {
    const errs = validateCreate(ntype, { discordUrl, telegramToken, telegramChatId, emailTo })
    setCreateErrors(errs)
    if (Object.keys(errs).length > 0) return

    setCreating(true)
    try {
      let config: Record<string, unknown> = {}
      if (ntype === "discord") config = { webhookUrl: discordUrl.trim() }
      else if (ntype === "telegram")
        config = { botToken: telegramToken.trim(), chatId: telegramChatId.trim() }
      else if (ntype === "email") config = { to: emailTo.trim() }
      await api.notifications.create({ name: nname.trim() || ntype, type: ntype, config })
      toast(t("notifications.channelCreated"), "success")
      await refresh()
      setModalOpen(false)
      resetCreateForm()
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        const fieldErrs = extractFieldErrors(e.body)
        if (Object.keys(fieldErrs).length > 0) {
          setCreateErrors(fieldErrs)
        } else {
          toast(t("notifications.failedCreate"), "error")
        }
      } else {
        toast(t("notifications.failedCreate"), "error")
      }
    } finally {
      setCreating(false)
    }
  }

  function resetCreateForm() {
    setNname("")
    setDiscordUrl("")
    setTelegramToken("")
    setTelegramChatId("")
    setEmailTo("")
    setCreateErrors({})
  }

  function openModal() {
    setNtype("discord")
    resetCreateForm()
    setModalOpen(true)
  }

  async function handleToggle(ch: Channel) {
    const next = !ch.enabled
    setChannels((prev) => prev.map((c) => (c.id === ch.id ? { ...c, enabled: next } : c)))
    try {
      await api.notifications.update(ch.id, { enabled: next })
    } catch {
      setChannels((prev) => prev.map((c) => (c.id === ch.id ? { ...c, enabled: !next } : c)))
      toast(t("notifications.failedUpdate"), "error")
    }
  }

  async function handleTest(id: string) {
    setTestingId(id)
    try {
      await api.notifications.test(id)
      toast(t("notifications.testSent"), "success")
    } catch {
      toast(t("notifications.testFailed"), "error")
    } finally {
      setTestingId(null)
    }
  }

  function openEdit(ch: Channel) {
    setExpandedId(ch.id)
    setEditName(ch.name)
    setEditErrors({})
    if (ch.type === "discord")
      setEditConfig({ webhookUrl: (ch.config?.webhookUrl as string) ?? "" })
    else if (ch.type === "telegram")
      setEditConfig({
        botToken: (ch.config?.botToken as string) ?? "",
        chatId: (ch.config?.chatId as string) ?? "",
      })
    else if (ch.type === "email") setEditConfig({ to: (ch.config?.to as string) ?? "" })
  }

  function closeEdit() {
    setExpandedId(null)
    setEditName("")
    setEditConfig({})
    setEditErrors({})
  }

  async function handleSaveEdit(id: string, type: string) {
    const errs = validateEdit(type, editConfig)
    setEditErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSavingEdit(true)
    try {
      const body: { name?: string; config?: Record<string, unknown> } = { config: editConfig }
      const trimmedName = editName.trim()
      if (trimmedName) body.name = trimmedName
      await api.notifications.update(id, body)
      toast(t("notifications.channelUpdated"), "success")
      await refresh()
      closeEdit()
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        const fieldErrs = extractFieldErrors(e.body)
        if (Object.keys(fieldErrs).length > 0) {
          setEditErrors(fieldErrs)
        } else {
          toast(t("notifications.failedUpdate"), "error")
        }
      } else {
        toast(t("notifications.failedUpdate"), "error")
      }
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await api.notifications.delete(deleteId)
      setChannels((prev) => prev.filter((c) => c.id !== deleteId))
      toast(t("notifications.deleted"), "success")
    } catch {
      toast(t("notifications.failedDelete"), "error")
    } finally {
      setDeleteId(null)
      setDeleteLabel("")
    }
  }

  const meta = (type: string) =>
    TYPE_META[type] ?? { icon: Bell, label: type, color: "text-[#697386]" }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#697386]" />
          <h1 className="text-lg font-semibold text-[#1a1f36] dark:text-zinc-100">
            {t("notifications.title")}
          </h1>
        </div>
        <button
          onClick={openModal}
          className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white inline-flex items-center gap-1.5 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("notifications.addChannel")}
        </button>
      </div>

      <div className="rounded-xl border border-[#e8eaed] dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm transition-colors">
        <div className="border-b border-[#e8eaed] dark:border-zinc-800/80 px-5 py-3.5">
          <h2 className="text-xs uppercase tracking-wider text-[#697386] dark:text-zinc-500 font-medium">
            {t("notifications.channels")}
          </h2>
        </div>

        {loading && (
          <div className="p-5">
            <SkeletonList rows={3} />
          </div>
        )}

        {!loading && channels.length === 0 && (
          <EmptyState
            icon={Bell}
            title={t("notifications.noChannels")}
            description={t("notifications.noChannelsDesc")}
          />
        )}

        {!loading && channels.length > 0 && (
          <div className="divide-y divide-[#e8eaed] dark:divide-zinc-800/50">
            {channels.map((ch) => {
              const m = meta(ch.type)
              const Icon = m.icon
              const isExpanded = expandedId === ch.id
              return (
                <div key={ch.id}>
                  <div
                    className={`flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-[#f6f8fa] dark:hover:bg-zinc-800/50 transition-colors ${isExpanded ? "bg-[#f6f8fa] dark:bg-zinc-800/30" : ""}`}
                    onClick={() => (isExpanded ? closeEdit() : openEdit(ch))}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`shrink-0 ${m.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-[#1a1f36] dark:text-zinc-100 truncate">
                          {ch.name}
                        </p>
                        <p className={`text-xs capitalize ${m.color}`}>{m.label}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleTest(ch.id)}
                        disabled={testingId === ch.id || !ch.enabled}
                        className="rounded-lg border border-[#e8eaed] dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-[#697386] dark:text-zinc-400 hover:bg-[#f6f8fa] dark:hover:bg-zinc-800 disabled:opacity-50 inline-flex items-center gap-1 transition-colors"
                      >
                        <Send className="h-3 w-3" />
                        {testingId === ch.id ? t("notifications.testing") : t("notifications.test")}
                      </button>
                      <button
                        onClick={() => {
                          setDeleteId(ch.id)
                          setDeleteLabel(ch.name)
                        }}
                        className="rounded-lg border border-[#e8eaed] dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 inline-flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <Toggle label="" checked={ch.enabled} onChange={() => handleToggle(ch)} />
                      <ChevronRight
                        className={`h-4 w-4 text-[#8e99a8] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[#e8eaed] dark:border-zinc-800/50 bg-[#fafbfc] dark:bg-zinc-900/50 px-5 py-4 space-y-3">
                      <div>
                        <label className={labelClass}>{t("notifications.name")}</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => {
                            setEditName(e.target.value)
                            setEditErrors((p) => {
                              const n = { ...p }
                              delete n["name"]
                              return n
                            })
                          }}
                          className={editErrors["name"] ? inputError : inputNormal}
                          placeholder={ch.name}
                        />
                        {editErrors["name"] && (
                          <p className="text-[10px] text-red-500 mt-1">{editErrors["name"]}</p>
                        )}
                      </div>
                      {ch.type === "discord" && (
                        <div>
                          <label className={labelClass}>{t("notifications.webhookUrl")}</label>
                          <input
                            type="text"
                            value={editConfig.webhookUrl ?? ""}
                            onChange={(e) => {
                              setEditConfig((p) => ({ ...p, webhookUrl: e.target.value }))
                              setEditErrors((p) => {
                                const n = { ...p }
                                delete n["config.webhookUrl"]
                                return n
                              })
                            }}
                            className={
                              editErrors["config.webhookUrl"] || editErrors["webhookUrl"]
                                ? inputError
                                : inputNormal
                            }
                            placeholder="https://discord.com/api/webhooks/..."
                          />
                          {(editErrors["config.webhookUrl"] || editErrors["webhookUrl"]) && (
                            <p className="text-[10px] text-red-500 mt-1">
                              {editErrors["config.webhookUrl"] ?? editErrors["webhookUrl"]}
                            </p>
                          )}
                        </div>
                      )}
                      {ch.type === "telegram" && (
                        <>
                          <div>
                            <label className={labelClass}>{t("notifications.botToken")}</label>
                            <input
                              type="text"
                              value={editConfig.botToken ?? ""}
                              onChange={(e) => {
                                setEditConfig((p) => ({ ...p, botToken: e.target.value }))
                                setEditErrors((p) => {
                                  const n = { ...p }
                                  delete n["config.botToken"]
                                  return n
                                })
                              }}
                              className={
                                editErrors["config.botToken"] || editErrors["botToken"]
                                  ? inputError
                                  : inputNormal
                              }
                              placeholder="123456:ABC-DEF..."
                            />
                            {(editErrors["config.botToken"] || editErrors["botToken"]) && (
                              <p className="text-[10px] text-red-500 mt-1">
                                {editErrors["config.botToken"] ?? editErrors["botToken"]}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className={labelClass}>{t("notifications.chatId")}</label>
                            <input
                              type="text"
                              value={editConfig.chatId ?? ""}
                              onChange={(e) => {
                                setEditConfig((p) => ({ ...p, chatId: e.target.value }))
                                setEditErrors((p) => {
                                  const n = { ...p }
                                  delete n["config.chatId"]
                                  return n
                                })
                              }}
                              className={
                                editErrors["config.chatId"] || editErrors["chatId"]
                                  ? inputError
                                  : inputNormal
                              }
                              placeholder="-1001234567890"
                            />
                            {(editErrors["config.chatId"] || editErrors["chatId"]) && (
                              <p className="text-[10px] text-red-500 mt-1">
                                {editErrors["config.chatId"] ?? editErrors["chatId"]}
                              </p>
                            )}
                          </div>
                        </>
                      )}
                      {ch.type === "email" && (
                        <div>
                          <label className={labelClass}>{t("notifications.email")}</label>
                          <input
                            type="text"
                            value={editConfig.to ?? ""}
                            onChange={(e) => {
                              setEditConfig((p) => ({ ...p, to: e.target.value }))
                              setEditErrors((p) => {
                                const n = { ...p }
                                delete n["config.to"]
                                return n
                              })
                            }}
                            className={
                              editErrors["config.to"] || editErrors["to"] ? inputError : inputNormal
                            }
                            placeholder="alerts@example.com"
                          />
                          {(editErrors["config.to"] || editErrors["to"]) && (
                            <p className="text-[10px] text-red-500 mt-1">
                              {editErrors["config.to"] ?? editErrors["to"]}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(ch.id, ch.type)}
                          disabled={savingEdit}
                          className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                        >
                          {savingEdit ? t("monitors.saving") : t("monitors.saveChanges")}
                        </button>
                        <button
                          onClick={closeEdit}
                          disabled={savingEdit}
                          className="rounded-lg border border-[#e8eaed] dark:border-zinc-700 px-4 py-2 text-sm font-medium text-[#697386] dark:text-zinc-400 hover:bg-[#f6f8fa] dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                        >
                          {t("monitors.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-2xl animate-in zoom-in-95 fade-in">
            <div className="border-b border-[#e8eaed] dark:border-zinc-800/80 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-[#1a1f36] dark:text-zinc-100">
                {t("notifications.addChannel")}
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={labelClass}>{t("notifications.type")}</label>
                <select
                  value={ntype}
                  onChange={(e) => {
                    setNtype(e.target.value)
                    setCreateErrors({})
                  }}
                  className={inputNormal}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_META[t]?.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t("notifications.name")}</label>
                <input
                  type="text"
                  value={nname}
                  onChange={(e) => {
                    setNname(e.target.value)
                    setCreateErrors((p) => {
                      const n = { ...p }
                      delete n["name"]
                      return n
                    })
                  }}
                  className={inputNormal}
                  placeholder="Production alerts"
                />
              </div>
              {ntype === "discord" && (
                <div>
                  <label className={labelClass}>{t("notifications.webhookUrl")}</label>
                  <input
                    type="text"
                    value={discordUrl}
                    onChange={(e) => {
                      setDiscordUrl(e.target.value)
                      setCreateErrors((p) => {
                        const n = { ...p }
                        delete n["discordUrl"]
                        delete n["config.webhookUrl"]
                        return n
                      })
                    }}
                    className={
                      createErrors["discordUrl"] || createErrors["config.webhookUrl"]
                        ? inputError
                        : inputNormal
                    }
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                  {(createErrors["discordUrl"] || createErrors["config.webhookUrl"]) && (
                    <p className="text-[10px] text-red-500 mt-1">
                      {createErrors["discordUrl"] ?? createErrors["config.webhookUrl"]}
                    </p>
                  )}
                </div>
              )}
              {ntype === "telegram" && (
                <>
                  <div>
                    <label className={labelClass}>{t("notifications.botToken")}</label>
                    <input
                      type="text"
                      value={telegramToken}
                      onChange={(e) => {
                        setTelegramToken(e.target.value)
                        setCreateErrors((p) => {
                          const n = { ...p }
                          delete n["telegramToken"]
                          delete n["config.botToken"]
                          return n
                        })
                      }}
                      className={
                        createErrors["telegramToken"] || createErrors["config.botToken"]
                          ? inputError
                          : inputNormal
                      }
                      placeholder="123456:ABC-DEF..."
                    />
                    {(createErrors["telegramToken"] || createErrors["config.botToken"]) && (
                      <p className="text-[10px] text-red-500 mt-1">
                        {createErrors["telegramToken"] ?? createErrors["config.botToken"]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>{t("notifications.chatId")}</label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => {
                        setTelegramChatId(e.target.value)
                        setCreateErrors((p) => {
                          const n = { ...p }
                          delete n["telegramChatId"]
                          delete n["config.chatId"]
                          return n
                        })
                      }}
                      className={
                        createErrors["telegramChatId"] || createErrors["config.chatId"]
                          ? inputError
                          : inputNormal
                      }
                      placeholder="-1001234567890"
                    />
                    {(createErrors["telegramChatId"] || createErrors["config.chatId"]) && (
                      <p className="text-[10px] text-red-500 mt-1">
                        {createErrors["telegramChatId"] ?? createErrors["config.chatId"]}
                      </p>
                    )}
                  </div>
                </>
              )}
              {ntype === "email" && (
                <div>
                  <label className={labelClass}>{t("notifications.email")}</label>
                  <input
                    type="text"
                    value={emailTo}
                    onChange={(e) => {
                      setEmailTo(e.target.value)
                      setCreateErrors((p) => {
                        const n = { ...p }
                        delete n["emailTo"]
                        delete n["config.to"]
                        return n
                      })
                    }}
                    className={
                      createErrors["emailTo"] || createErrors["config.to"]
                        ? inputError
                        : inputNormal
                    }
                    placeholder="alerts@example.com"
                  />
                  {(createErrors["emailTo"] || createErrors["config.to"]) && (
                    <p className="text-[10px] text-red-500 mt-1">
                      {createErrors["emailTo"] ?? createErrors["config.to"]}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button
                onClick={() => setModalOpen(false)}
                disabled={creating}
                className="rounded-lg border border-[#e8eaed] dark:border-zinc-700 px-4 py-2 text-sm font-medium text-[#697386] dark:text-zinc-400 hover:bg-[#f6f8fa] dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {t("monitors.cancel")}
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="h-4 w-4" />
                {creating ? t("notifications.creating") : t("notifications.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        onCancel={() => {
          setDeleteId(null)
          setDeleteLabel("")
        }}
        title={t("notifications.deleteTitle")}
        message={t("notifications.deleteMessage", { name: deleteLabel })}
        confirmLabel={t("monitors.delete")}
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  )
}
