import { useQuery } from "@tanstack/react-query"
import { Navigate, Outlet, useLocation } from "react-router"
import { NProgress } from "@/components/shared/NProgress"
import { Sidebar } from "@/components/shared/Sidebar"
import { ApiError, api } from "@/lib/api"

/** Authenticated shell: checks the session, then renders the sidebar + page. */
export function AppLayout() {
  const location = useLocation()
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api.auth.me(),
    retry: false,
    staleTime: 60_000,
  })
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
    enabled: session.isSuccess,
    staleTime: 60_000,
  })

  if (session.isPending) return null
  if (session.error instanceof ApiError && session.error.status === 401) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const instanceName = settings.data?.instanceName

  return (
    <div className="flex h-screen">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <NProgress />
      <Sidebar {...(instanceName !== undefined ? { instanceName } : {})} />
      <main id="main-content" className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
