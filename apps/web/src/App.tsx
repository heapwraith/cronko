import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router"
import { CommandPalette } from "@/components/shared/CommandPalette"
import { KeyboardShortcuts } from "@/components/shared/KeyboardShortcuts"
import { Providers } from "@/components/shared/Providers"
import { I18nProvider } from "@/lib/i18n"
import { AppLayout } from "@/routes/AppLayout"
import { ErrorPage } from "@/routes/ErrorPage"

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } },
})

/** Router-aware globals (they use navigation hooks, so they live inside the router). */
function RootShell() {
  return (
    <>
      <Outlet />
      <CommandPalette />
      <KeyboardShortcuts />
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <RootShell />,
    HydrateFallback: () => null,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/login",
        lazy: () => import("@/pages/Login").then((m) => ({ Component: m.default })),
        errorElement: <ErrorPage />,
      },
      {
        element: <AppLayout />,
        errorElement: <ErrorPage />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: "dashboard",
            lazy: () => import("@/pages/Dashboard").then((m) => ({ Component: m.default })),
          },
          {
            path: "monitors",
            lazy: () => import("@/pages/Monitors").then((m) => ({ Component: m.default })),
          },
          {
            path: "monitors/new",
            lazy: () => import("@/pages/MonitorNew").then((m) => ({ Component: m.default })),
          },
          {
            path: "monitors/:id",
            lazy: () => import("@/pages/MonitorDetail").then((m) => ({ Component: m.default })),
          },
          {
            path: "monitors/:id/runs/:runId",
            lazy: () => import("@/pages/RunDetail").then((m) => ({ Component: m.default })),
          },
          {
            path: "monitors/:id/edit",
            lazy: () => import("@/pages/MonitorEdit").then((m) => ({ Component: m.default })),
          },
          {
            path: "incidents",
            lazy: () => import("@/pages/Incidents").then((m) => ({ Component: m.default })),
          },
          {
            path: "notifications",
            lazy: () => import("@/pages/Notifications").then((m) => ({ Component: m.default })),
          },
          {
            path: "settings",
            lazy: () => import("@/pages/Settings").then((m) => ({ Component: m.default })),
          },
          {
            path: "how-to-use",
            lazy: () => import("@/pages/HowToUse").then((m) => ({ Component: m.default })),
          },
          {
            path: "*",
            lazy: () => import("@/pages/NotFound").then((m) => ({ Component: m.default })),
          },
        ],
      },
    ],
  },
])

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Providers>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </Providers>
    </QueryClientProvider>
  )
}
