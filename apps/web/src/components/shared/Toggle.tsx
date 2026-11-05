"use client"

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  hint?: string
}

export function Toggle({ label, checked, onChange, disabled, hint }: ToggleProps) {
  return (
    <label
      className={`flex items-start gap-3 select-none ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#5e6ad2]/40 ${
          checked ? "bg-[#5e6ad2]" : "bg-[#dde0e4] dark:bg-zinc-600"
        } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-4.5" : "translate-x-0.75"
          }`}
        />
      </button>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium text-[#1a1f36] dark:text-zinc-100">{label}</span>
        {hint && (
          <p className="text-[10px] text-[#8e99a8] dark:text-zinc-500 mt-0.5 leading-relaxed">
            {hint}
          </p>
        )}
      </div>
    </label>
  )
}
