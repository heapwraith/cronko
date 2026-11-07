import { spawn, spawnSync } from "node:child_process"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { resolve } from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

const SCRIPT = resolve(import.meta.dirname, "../../../web/public/cronko-run")

type Hit = { method: string; url: string; body: string; contentType: string | undefined }

describe("cronko-run wrapper (real sh + curl)", () => {
  let server: Server
  let base = ""
  let hits: Hit[] = []

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = ""
      req.on("data", (c) => {
        body += c
      })
      req.on("end", () => {
        hits.push({
          method: req.method ?? "",
          url: req.url ?? "",
          body,
          contentType: req.headers["content-type"],
        })
        res.end("{}")
      })
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ping/tok`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))
  beforeEach(() => {
    hits = []
  })

  const run = (...args: string[]) =>
    // spawnSync would block the event loop and with it the fake Cronko server.
    new Promise<{ status: number | null; stdout: string }>((done) => {
      const child = spawn("sh", [SCRIPT, ...args])
      let stdout = ""
      child.stdout.on("data", (c) => {
        stdout += c
      })
      child.on("close", (status) => done({ status, stdout }))
    })

  it("reports success with duration, exit 0 and the job output", async () => {
    const { status, stdout } = await run(base, "--", "sh", "-c", "echo hello; echo oops >&2")
    expect(status).toBe(0)
    expect(stdout).toContain("hello")
    expect(hits).toHaveLength(1)
    const [hit] = hits
    expect(hit?.method).toBe("POST")
    expect(hit?.url).toMatch(/^\/ping\/tok\?d=\d+&exit=0$/)
    expect(hit?.body).toBe("hello\noops\n")
    expect(hit?.contentType).toBe("text/plain")
  })

  it("reports a failure on /fail and keeps the job's exit code", async () => {
    const { status } = await run(base, "sh", "-c", "echo broken; exit 3")
    expect(status).toBe(3)
    expect(hits[0]?.url).toMatch(/^\/ping\/tok\/fail\?d=\d+&exit=3$/)
    expect(hits[0]?.body).toBe("broken\n")
  })

  it("sends only the tail of long output", async () => {
    await run(
      base,
      "--",
      "sh",
      "-c",
      "i=0; while [ $i -lt 3000 ]; do echo line-$i; i=$((i+1)); done",
    )
    const body = hits[0]?.body ?? ""
    expect(body.length).toBeLessThanOrEqual(10_000)
    expect(body.endsWith("line-2999\n")).toBe(true)
  })

  it("reports 127 when the command does not exist, and rejects bad usage", async () => {
    const { status } = await run(base, "--", "definitely-not-a-command-xyz")
    expect(status).toBe(127)
    expect(hits[0]?.url).toMatch(/\/fail\?d=\d+&exit=127$/)

    expect(spawnSync("sh", [SCRIPT]).status).toBe(64)
    expect(spawnSync("sh", [SCRIPT, "https://example.com/nope", "true"]).status).toBe(64)
  })
})

describe("cronko-run: CRONKO_FAIL_ON_PING_ERROR", () => {
  const down = "http://127.0.0.1:9/ping/tok"
  const exec = (env: Record<string, string>, ...cmd: string[]) =>
    new Promise<number | null>((done) => {
      const child = spawn("sh", [SCRIPT, down, "--", ...cmd], {
        env: { PATH: process.env.PATH ?? "", CRONKO_TIMEOUT: "2", ...env },
      })
      child.on("close", (status) => done(status))
    })

  it("keeps the job's exit code by default when Cronko is unreachable", async () => {
    expect(await exec({}, "sh", "-c", "exit 0")).toBe(0)
    expect(await exec({}, "sh", "-c", "exit 5")).toBe(5)
  })

  it("exits 75 only when the job succeeded and the ping failed", async () => {
    const env = { CRONKO_FAIL_ON_PING_ERROR: "1" }
    expect(await exec(env, "sh", "-c", "exit 0")).toBe(75)
    expect(await exec(env, "sh", "-c", "exit 5")).toBe(5)
  })
})
