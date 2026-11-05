import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { useT } from "@/lib/i18n"

async function fetchEmail(): Promise<string | null> {
  try {
    const data = await api.auth.me()
    return data.email
  } catch {
    return null
  }
}

function getInitials(email: string): string {
  const namePart = email.split("@")[0] ?? email
  const parts = namePart.split(/[._-]/)
  const first = parts[0]?.[0]
  const second = parts[1]?.[0]
  if (first && second) {
    return (first + second).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

const colors = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
]

export function UserAvatar({
  collapsed = false,
  compact = false,
}: {
  collapsed?: boolean
  compact?: boolean
}) {
  const { t } = useT()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    fetchEmail().then(setEmail)
  }, [])

  const initials = email ? getInitials(email) : "?"
  const colorIndex = email
    ? email.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length
    : 0
  const color = colors[colorIndex] ?? colors[0]

  if (compact || collapsed) {
    return (
      <div
        className={`h-7 w-7 rounded-full ${email ? color : "bg-zinc-700"} flex items-center justify-center text-[10px] font-semibold text-white shrink-0`}
        title={email ?? undefined}
      >
        {initials}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <div
        className={`h-7 w-7 rounded-full ${email ? color : "bg-zinc-700"} flex items-center justify-center text-[10px] font-semibold text-white shrink-0`}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-none text-[#697386] dark:text-zinc-400 truncate">
          {email ?? t("ui.notSignedIn")}
        </p>
      </div>
    </div>
  )
}
