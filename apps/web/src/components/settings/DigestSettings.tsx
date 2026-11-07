import type { DigestFrequency } from "@cronko/shared/digest"
import { Button } from "@/components/shared/Button"
import { useT } from "@/lib/i18n"
import { control, Field, Group } from "./fields"
import { HOURS, type SettingsData } from "./model"

/** Periodic digest: frequency, hour of day and a "send a test now" button. */
export function DigestSettings({
  settings,
  onChange: set,
  sending: sendingDigest,
  onSendTest: sendTestDigest,
}: {
  settings: SettingsData
  onChange: <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => void
  sending: boolean
  onSendTest: () => void
}) {
  const { t } = useT()
  return (
    <Group title={t("settings.digest")}>
      <p className="text-sm text-dim">{t("settings.digestIntro")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("settings.digestFrequency")}>
          <select
            value={settings.digestFrequency}
            onChange={(e) => set("digestFrequency", e.target.value as DigestFrequency)}
            className={control}
          >
            <option value="off">{t("settings.digestOff")}</option>
            <option value="daily">{t("settings.digestDaily")}</option>
            <option value="weekly">{t("settings.digestWeekly")}</option>
          </select>
        </Field>
        <Field
          label={t("settings.digestHour")}
          hint={t("settings.digestHourHint", { tz: settings.timezone })}
        >
          <select
            value={settings.digestHour}
            onChange={(e) => set("digestHour", Number(e.target.value))}
            disabled={settings.digestFrequency === "off"}
            className={`${control} font-mono tnum`}
          >
            {HOURS.map((label, h) => (
              <option key={label} value={h}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={sendTestDigest} disabled={sendingDigest}>
          {t("settings.digestSendTest")}
        </Button>
        <span className="text-xs text-dim">{t("settings.digestSendTestHint")}</span>
      </div>
    </Group>
  )
}
