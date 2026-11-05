import { redirect } from "next/navigation"
import { Suspense } from "react"
import { NProgress } from "@/components/shared/NProgress"
import { Sidebar } from "@/components/shared/Sidebar"
import { ApiError, api } from "@/lib/api"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try {
    await api.auth.me()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      redirect("/login")
    }
  }

  let instanceName: string | undefined

  try {
    const settings = await api.settings.get()
    instanceName = settings.instanceName
  } catch (e) {
    if (!(e instanceof Error && e.message === "API 401")) {
      // eslint-disable-next-line no-console
      console.error("Failed to load settings for sidebar:", e)
    }
  }

  return (
    <div className="flex h-screen">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Suspense fallback={null}>
        <NProgress />
      </Suspense>
      <Sidebar {...(instanceName !== undefined ? { instanceName } : {})} />
      <main id="main-content" className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}
