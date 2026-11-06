import { useId } from "react"
import { useT } from "@/lib/i18n"
import { channelMeta } from "./channels"

const input =
  "min-h-10 w-full rounded-[4px] border bg-panel px-3 text-sm text-ink placeholder:text-dim focus-visible:outline-2"

type Props = {
  type: string
  name: string
  onName: (v: string) => void
  values: Record<string, string>
  onValue: (key: string, v: string) => void
  /** Already-translated error text per field key (`name` included). */
  errors: Record<string, string>
  namePlaceholder?: string
}

/** Name plus the per-type fields; shared by "add channel" and "edit channel". */
export function ChannelFields({
  type,
  name,
  onName,
  values,
  onValue,
  errors,
  namePlaceholder,
}: Props) {
  const { t } = useT()
  const uid = useId()
  const fields = channelMeta(type).fields

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${uid}-name`} className="mb-1.5 block text-sm font-medium text-ink">
          {t("notifications.name")}
        </label>
        <input
          id={`${uid}-name`}
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={namePlaceholder}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${uid}-name-err` : undefined}
          className={`${input} ${errors.name ? "border-down" : "border-line-strong"}`}
        />
        {errors.name && (
          <p id={`${uid}-name-err`} className="mt-1 text-xs font-medium text-down">
            {errors.name}
          </p>
        )}
      </div>
      {fields.map((f) => {
        const id = `${uid}-${f.key}`
        const err = errors[f.key]
        return (
          <div key={f.key}>
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
              {t(f.labelKey)}
            </label>
            <input
              id={id}
              type={f.type ?? "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => onValue(f.key, e.target.value)}
              placeholder={f.placeholder}
              autoComplete={f.autoComplete ?? "off"}
              spellCheck={false}
              aria-invalid={!!err}
              aria-describedby={err ? `${id}-err` : undefined}
              className={`${input} font-mono ${err ? "border-down" : "border-line-strong"}`}
            />
            {err && (
              <p id={`${id}-err`} className="mt-1 text-xs font-medium text-down">
                {err}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
