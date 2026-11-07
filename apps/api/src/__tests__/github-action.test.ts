import { spawn } from "node:child_process"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { resolve } from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

const SCRIPT = resolve(import.meta.dirname, "../../../../action/run.sh")

type Hit = { method: string; url: string; body: string }

describe("GitHub Action entry point (real sh + curl)", () => {
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
        hits.push({ method: req.method ?? "", url: req.url ?? "", body })
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

  // spawnSync would block the event loop and with it the fake Cronko server.
  const run = (env: Record<string, string>) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
      const child = spawn("sh", [SCRIPT], {
        env: { PATH: process.env.PATH ?? "", CRONKO_TIMEOUT: "2", ...env },
      })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (c) => {
        stdout += c
      })
      child.stderr.on("data", (c) => {
        stderr += c
      })
      child.on("close", (status) => done({ status, stdout, stderr }))
    })

  // Nothing listens here: the connection is refused at once.
  const DOWN = "http://127.0.0.1:9/ping/tok"

  it("wrap: runs the command, reports duration, exit 0 and the output", async () => {
    const r = await run({ CRONKO_URL: base, CRONKO_COMMAND: "echo hello; echo oops >&2" })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain("hello")
    expect(hits).toHaveLength(1)
    expect(hits[0]?.url).toMatch(/^\/ping\/tok\?d=\d+&exit=0$/)
    expect(hits[0]?.body).toBe("hello\noops\n")
  })

  it("wrap: a failing command fails the step with its own code and reports /fail", async () => {
    const r = await run({ CRONKO_URL: base, CRONKO_COMMAND: "echo before; exit 3" })
    expect(r.status).toBe(3)
    expect(hits[0]?.url).toMatch(/^\/ping\/tok\/fail\?d=\d+&exit=3$/)
    expect(hits[0]?.body).toBe("before\n")
  })

  it("wrap: quotes, dollars and backticks in the command reach the shell untouched", async () => {
    // A quoted heredoc prints its body verbatim, so any expansion would come from the action.
    const line = `a"b $HOME \`x\` it's $(whoami)`
    const r = await run({ CRONKO_URL: base, CRONKO_COMMAND: `cat <<'EOF'\n${line}\nEOF` })
    expect(r.status).toBe(0)
    expect(hits[0]?.body).toBe(`${line}\n`)
  })

  it("wrap: honours the shell and the output limit", async () => {
    const r = await run({
      CRONKO_URL: base,
      CRONKO_COMMAND: "printf 'abcdefghij'",
      CRONKO_MAX_OUTPUT: "4",
      CRONKO_SHELL: "sh",
    })
    expect(r.status).toBe(0)
    expect(hits[0]?.body).toBe("ghij")
  })

  it("start and report send the right pings", async () => {
    expect((await run({ CRONKO_URL: base, CRONKO_MODE: "start" })).status).toBe(0)
    expect((await run({ CRONKO_URL: base, CRONKO_MODE: "report" })).status).toBe(0)
    expect(
      (await run({ CRONKO_URL: base, CRONKO_MODE: "report", CRONKO_STATUS: "failure" })).status,
    ).toBe(0)
    expect(hits.map((h) => `${h.method} ${h.url}`)).toEqual([
      "POST /ping/tok/start",
      "POST /ping/tok",
      "POST /ping/tok/fail",
    ])
  })

  it("report: cancelled and skipped send nothing; an unknown status is an error", async () => {
    for (const status of ["cancelled", "skipped"]) {
      const r = await run({ CRONKO_URL: base, CRONKO_MODE: "report", CRONKO_STATUS: status })
      expect(r.status).toBe(0)
      expect(r.stdout).toContain("nothing reported")
    }
    expect(hits).toHaveLength(0)
    const bad = await run({ CRONKO_URL: base, CRONKO_MODE: "report", CRONKO_STATUS: "weird" })
    expect(bad.status).toBe(64)
  })

  it("works with the slug URL and strips a trailing slash", async () => {
    const r = await run({
      CRONKO_URL: `${base.replace("/ping/tok", "/ping/k/pk_x/nightly")}/`,
      CRONKO_MODE: "report",
    })
    expect(r.status).toBe(0)
    expect(hits[0]?.url).toBe("/ping/k/pk_x/nightly")
  })

  it("a Cronko outage does not fail the job by default, but does with fail-on-ping-error", async () => {
    const wrapOk = await run({ CRONKO_URL: DOWN, CRONKO_COMMAND: "echo ok" })
    expect(wrapOk.status).toBe(0)
    const wrapFail = await run({ CRONKO_URL: DOWN, CRONKO_COMMAND: "exit 4" })
    expect(wrapFail.status).toBe(4)

    const reportOk = await run({ CRONKO_URL: DOWN, CRONKO_MODE: "report" })
    expect(reportOk.status).toBe(0)
    expect(reportOk.stdout).toContain("::warning::")

    const strictWrap = await run({
      CRONKO_URL: DOWN,
      CRONKO_COMMAND: "echo ok",
      CRONKO_FAIL_ON_PING_ERROR: "true",
    })
    expect(strictWrap.status).toBe(75)
    const strictWrapFail = await run({
      CRONKO_URL: DOWN,
      CRONKO_COMMAND: "exit 4",
      CRONKO_FAIL_ON_PING_ERROR: "true",
    })
    expect(strictWrapFail.status).toBe(4)
    const strictReport = await run({
      CRONKO_URL: DOWN,
      CRONKO_MODE: "report",
      CRONKO_FAIL_ON_PING_ERROR: "true",
    })
    expect(strictReport.status).toBe(75)
  })

  it("masks the URL and never prints it", async () => {
    const r = await run({ CRONKO_URL: base, CRONKO_MODE: "report" })
    expect(r.stdout).toContain(`::add-mask::${base}`)
    const down = await run({ CRONKO_URL: DOWN, CRONKO_MODE: "report" })
    expect(down.stdout.replace(`::add-mask::${DOWN}`, "")).not.toContain(DOWN)
    expect(down.stderr).not.toContain(DOWN)
  })

  it("rejects a missing or non-Cronko URL, an unknown mode and wrap without a command", async () => {
    expect((await run({})).status).toBe(64)
    expect((await run({ CRONKO_URL: "https://example.com/health" })).status).toBe(64)
    expect((await run({ CRONKO_URL: base, CRONKO_MODE: "nope" })).status).toBe(64)
    expect((await run({ CRONKO_URL: base })).status).toBe(64)
    expect(hits).toHaveLength(0)
  })
})
