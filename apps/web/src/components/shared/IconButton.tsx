import type { ButtonHTMLAttributes, ReactNode } from "react"

/** Square toolbar button; the accessible name is mandatory. */
export function IconButton({
  label,
  children,
  className = "",
  ...rest
}: { label: string; children: ReactNode } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "title"
>) {
  return (
    <button
      type="button"
      {...rest}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-[4px] text-dim transition-colors hover:bg-raised hover:text-ink ${className}`}
    >
      {children}
    </button>
  )
}
