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
  "inline-flex items-center justify-center gap-1.5 rounded-[2px] font-semibold transition-[background-color,border-color,color] duration-150 disabled:pointer-events-none disabled:opacity-50"

const variants: Record<Variant, string> = {
  primary: "bg-signal text-signal-fg hover:brightness-95 active:brightness-90",
  secondary: "border border-line-strong bg-panel text-ink hover:bg-raised",
  ghost: "text-dim hover:bg-raised hover:text-ink",
  danger: "border border-down bg-transparent text-down hover:bg-down hover:text-signal-fg",
}

const sizes: Record<"sm" | "md", string> = {
  sm: "min-h-8 px-3 text-xs",
  md: "min-h-10 px-4 text-sm",
}

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", className = "", children } = props
  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`

  if (props.href !== undefined) {
    return (
      <Link to={props.href} className={classes} target={props.target} rel={props.rel}>
        {children}
      </Link>
    )
  }

  const {
    variant: _v,
    size: _s,
    className: _c,
    children: _ch,
    href: _h,
    type = "button",
    ...rest
  } = props
  return (
    <button {...rest} type={type} className={classes}>
      {children}
    </button>
  )
}
