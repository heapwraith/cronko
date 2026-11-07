import { cloneElement, type ReactElement, useId } from "react"

export const control =
  "min-h-10 w-full rounded-md border border-line-strong bg-ground px-3 text-sm text-ink placeholder:text-dim focus-visible:outline-2 disabled:opacity-50"

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** Label, control, optional hint and a computed readout, wired for assistive tech. */
export function Field({
  label,
  hint,
  readout,
  children,
}: {
  label: string
  hint?: string
  readout?: string
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>
}) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-medium"
      >
        {label}
        {readout && <span className="font-mono text-xs font-normal text-dim tnum">{readout}</span>}
      </label>
      {cloneElement(children, hint ? { id, "aria-describedby": hintId } : { id })}
      {hint && (
        <p id={hintId} className="mt-1 text-xs leading-relaxed text-dim">
          {hint}
        </p>
      )}
    </div>
  )
}

export function NumberInput({
  value,
  onChange,
  fallback,
  ...rest
}: {
  value: number
  onChange: (n: number) => void
  fallback: number
  min?: number
  max?: number
  disabled?: boolean
  id?: string
  "aria-describedby"?: string
}) {
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || fallback)}
      className={`${control} font-mono tnum`}
    />
  )
}
