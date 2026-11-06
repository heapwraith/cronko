import { Link } from "react-router"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h2 className="text-sm font-medium text-zinc-400">Page not found</h2>
      <p className="mt-1 text-sm text-zinc-500">The page you are looking for does not exist.</p>
      <Link
        to="/dashboard"
        className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
      >
        Go to Dashboard
      </Link>
    </div>
  )
}
