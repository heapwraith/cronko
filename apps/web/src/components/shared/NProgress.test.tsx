import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act, render, screen } from "@testing-library/react"
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NProgress } from "./NProgress"

const active = () => screen.getByTestId("nprogress").getAttribute("data-active") === "true"
const barWidth = () =>
  Number.parseFloat(
    (screen.getByTestId("nprogress").firstElementChild as HTMLElement).style.width || "0",
  )

/** A query whose answer the test releases by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function Probe({ queryKey, fn }: { queryKey: string[]; fn: () => Promise<string> }) {
  useQuery({ queryKey, queryFn: fn })
  return null
}

function setup(ui: React.ReactNode, client = new QueryClient()) {
  // NProgress sits in a layout that stays mounted across pages, like AppLayout does.
  const router = createMemoryRouter([
    {
      element: (
        <>
          <NProgress />
          <Outlet />
        </>
      ),
      children: [
        {
          path: "/",
          element: (
            <>
              <Link to="/slow">go</Link>
              {ui}
            </>
          ),
        },
        {
          path: "/slow",
          lazy: () => lazyGate.promise.then(() => ({ element: <p>slow page</p> })),
        },
      ],
    },
  ])
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { client, router }
}

let lazyGate = deferred<void>()

describe("NProgress follows real work", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    lazyGate = deferred<void>()
  })
  afterEach(() => vi.useRealTimers())

  it("is idle and invisible when nothing is loading", async () => {
    setup(null)
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    expect(active()).toBe(false)
    expect(barWidth()).toBe(0)
  })

  it("does not flash for a load that finishes at once", async () => {
    const q = deferred<string>()
    setup(<Probe queryKey={["fast"]} fn={() => q.promise} />)
    await act(async () => vi.advanceTimersByTimeAsync(50))
    q.resolve("ok")
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(active()).toBe(false)
  })

  it("shows while a query without data is fetching, creeps but never fills, then completes and hides", async () => {
    const q = deferred<string>()
    setup(<Probe queryKey={["slow"]} fn={() => q.promise} />)
    await act(async () => vi.advanceTimersByTimeAsync(200))
    expect(active()).toBe(true)
    const early = barWidth()
    expect(early).toBeGreaterThan(0)

    // A long wait: the bar keeps going but stays short of full, because nothing finished.
    await act(async () => vi.advanceTimersByTimeAsync(20_000))
    expect(active()).toBe(true)
    expect(barWidth()).toBeGreaterThan(early)
    expect(barWidth()).toBeLessThan(90.5)

    q.resolve("done")
    await act(async () => vi.advanceTimersByTimeAsync(10))
    expect(barWidth()).toBe(100)
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(active()).toBe(false)
    expect(barWidth()).toBe(0)
  })

  it("stays quiet for a background refresh of data that is already on screen", async () => {
    const client = new QueryClient()
    client.setQueryData(["cached"], "already here")
    const refetch = deferred<string>()
    setup(<Probe queryKey={["cached"]} fn={() => refetch.promise} />, client)
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(client.isFetching()).toBe(1) // it really is refetching...
    expect(active()).toBe(false) // ...but the bar does not move
  })

  it("shows while a page is loading and hides when it has loaded", async () => {
    const { router } = setup(null)
    await act(async () => {
      void router.navigate("/slow")
    })
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(active()).toBe(true)
    lazyGate.resolve()
    // Let the navigation commit, then let the finished bar fade out.
    await act(async () => vi.advanceTimersByTimeAsync(100))
    expect(screen.getByText("slow page")).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(600))
    expect(active()).toBe(false)
    expect(barWidth()).toBe(0)
  })

  it("hides even when more work starts while the bar is fading out", async () => {
    // The real app fires queries one after another; this used to leave the bar stuck on screen.
    const first = deferred<string>()
    const { client } = setup(<Probe queryKey={["a"]} fn={() => first.promise} />)
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(active()).toBe(true)

    first.resolve("x")
    await act(async () => vi.advanceTimersByTimeAsync(100)) // finishing: full and fading
    expect(barWidth()).toBe(100)

    const second = deferred<string>()
    void client.fetchQuery({ queryKey: ["b"], queryFn: () => second.promise })
    await act(async () => vi.advanceTimersByTimeAsync(50)) // resumed before the bar left
    expect(active()).toBe(true)
    expect(barWidth()).toBeLessThan(100)

    second.resolve("y")
    await act(async () => vi.advanceTimersByTimeAsync(20))
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(active()).toBe(false)
    expect(barWidth()).toBe(0)
  })

  it("hides after a quick burst of overlapping loads", async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()]
    const { client } = setup(null)
    gates.forEach((g, i) => {
      void client.fetchQuery({ queryKey: ["burst", String(i)], queryFn: () => g.promise })
    })
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(active()).toBe(true)
    for (const g of gates) {
      g.resolve("ok")
      await act(async () => vi.advanceTimersByTimeAsync(40))
    }
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(active()).toBe(false)
  })

  it("can be used again after finishing", async () => {
    const first = deferred<string>()
    const { client } = setup(<Probe queryKey={["one"]} fn={() => first.promise} />)
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(active()).toBe(true)
    first.resolve("x")
    await act(async () => vi.advanceTimersByTimeAsync(600))
    expect(active()).toBe(false)

    const second = deferred<string>()
    void client.fetchQuery({ queryKey: ["two"], queryFn: () => second.promise })
    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(active()).toBe(true)
    second.resolve("y")
    await act(async () => vi.advanceTimersByTimeAsync(600))
    expect(active()).toBe(false)
  })
})
