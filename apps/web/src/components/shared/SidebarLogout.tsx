import { LogOut } from "lucide-react"
import { useNavigate } from "react-router"
import { api } from "@/lib/api"

export function SidebarLogout({
  collapsed = false,
  iconOnly = false,
}: {
  collapsed?: boolean
  iconOnly?: boolean
}) {
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await api.auth.logout()
    } catch {
      /* logout best-effort */
    }
    navigate("/login")
  }

  return (
    <button
      onClick={handleLogout}
      title={collapsed ? "Logout" : undefined}
      className={`flex items-center gap-2.5 mx-1.5 px-3 py-2 text-[13px] rounded-md text-[#697386] dark:text-zinc-400 hover:text-[#1a1f36] dark:hover:text-zinc-200 hover:bg-[#efede9] dark:hover:bg-zinc-800/50 transition-colors w-full text-left ${
        collapsed || iconOnly ? "justify-center mx-0 px-0 py-0 w-8 h-8" : ""
      }`}
    >
      <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      {!collapsed && !iconOnly && <span className="leading-none">Logout</span>}
    </button>
  )
}
