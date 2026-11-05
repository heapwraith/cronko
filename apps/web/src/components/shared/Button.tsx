import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Link } from "react-router"

type Variant = "primary" | "secondary" | "ghost" | "danger"

interface ButtonBaseProps {
  variant?: Variant
  size?: "sm" | "md"
  children: ReactNode
  className?: string
}

type ButtonAsButton = ButtonBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined }

type ButtonAsLink = ButtonBaseProps & {
  href: string
  target?: string
  rel?: string
}

type ButtonProps = ButtonAsButton | ButtonAsLink

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 dark:focus-visible:ring-offset-zinc-950 focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none"

const variants: Record<Variant, string> = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-500",
  secondary:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700",
  ghost:
    "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50",
  danger: "bg-red-600 text-white hover:bg-red-500",
}

const sizes: Record<"sm" | "md", string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
}

export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant = "primary", size = "md", className = "", children, href, target, rel } = props
    return (
      <Link
        to={href}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        target={target}
        rel={rel}
      >
        {children}
      </Link>
    )
  }

  const {
    variant = "primary",
    size = "md",
    className = "",
    children,
    type = "button",
    href: _href,
    ...rest
  } = props
  return (
    // biome-ignore lint/a11y/useButtonType: type defaults to "button" above and is overridable
    <button
      {...rest}
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  )
}
