import { useNavigate, useRouteError } from "react-router"

export function ErrorPage() {
  const error = useRouteError()
  const navigate = useNavigate()
  if (import.meta.env.DEV) console.error(error)

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h2 className="text-sm font-medium text-zinc-400">Something went wrong</h2>
      <p className="mt-1 text-sm text-zinc-500">An unexpected error occurred. Please try again.</p>
      <button
        type="button"
        onClick={() => navigate(0)}
        className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
      >
        Try again
      </button>
    </div>
  )
}
