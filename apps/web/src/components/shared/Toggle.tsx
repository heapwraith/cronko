interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  hint?: string
  /** Keep the label for assistive tech only (e.g. inside a table row). */
  hideLabel?: boolean
}

/**
 * Switch: the thumb moves as well as the fill changing, so on/off never
 * depends on colour alone.
 */
export function Toggle({ label, checked, onChange, disabled, hint, hideLabel }: ToggleProps) {
  return (
    <label
      className={`flex select-none items-start gap-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-md border transition-colors duration-150 focus-visible:outline-2 ${
          checked ? "border-signal bg-signal" : "border-line-strong bg-raised"
        } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          aria-hidden="true"
          className={`block h-3 w-3 rounded-md transition-transform duration-150 ${
            checked ? "translate-x-[1.125rem] bg-signal-fg" : "translate-x-[0.1875rem] bg-dim"
          }`}
        />
      </button>
      <span className={hideLabel ? "sr-only" : "flex min-w-0 flex-col"}>
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && !hideLabel && (
          <span className="mt-0.5 text-xs leading-relaxed text-dim">{hint}</span>
        )}
      </span>
    </label>
  )
}
