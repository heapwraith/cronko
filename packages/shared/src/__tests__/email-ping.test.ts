import { describe, expect, it } from "vitest"
import { classifyEmail, emailRunBody, normalizeEmailKeywords, parseRecipient } from "../email-ping"

const TOKEN = "3f2c1a9e-7b4d-4e8a-9c1f-0a2b3c4d5e6f"

describe("parseRecipient", () => {
  it("reads the token, case-insensitively, on the configured domain", () => {
    expect(parseRecipient(`${TOKEN}@ping.example.com`, "ping.example.com")).toEqual({
      token: TOKEN,
      kind: "success",
    })
    expect(parseRecipient(`${TOKEN.toUpperCase()}@PING.example.com`, "ping.example.com")).toEqual({
      token: TOKEN,
      kind: "success",
    })
  })

  it("reads +fail as an explicit failure", () => {
    expect(parseRecipient(`${TOKEN}+fail@ping.example.com`, "ping.example.com")?.kind).toBe("fail")
  })

  it("accepts any domain when none is configured", () => {
    expect(parseRecipient(`${TOKEN}@whatever.test`, undefined)?.token).toBe(TOKEN)
  })

  it("refuses other domains, non-tokens and unknown suffixes", () => {
    expect(parseRecipient(`${TOKEN}@evil.test`, "ping.example.com")).toBeNull()
    expect(parseRecipient("postmaster@ping.example.com", "ping.example.com")).toBeNull()
    expect(parseRecipient(`${TOKEN}+start@ping.example.com`, "ping.example.com")).toBeNull()
    expect(parseRecipient(`${TOKEN}+fail+x@ping.example.com`, "ping.example.com")).toBeNull()
    expect(parseRecipient("no-at-sign", null)).toBeNull()
  })
})

describe("classifyEmail", () => {
  it("is a success unless a failure keyword is in the subject", () => {
    expect(classifyEmail("success", "Backup completed", ["error", "failed"])).toBe("success")
    expect(classifyEmail("success", "Backup FAILED on nas01", ["error", "failed"])).toBe("fail")
    expect(classifyEmail("success", "anything", [])).toBe("success")
  })

  it("+fail always wins", () => {
    expect(classifyEmail("fail", "All good", [])).toBe("fail")
  })
})

describe("normalizeEmailKeywords", () => {
  it("trims, lowercases, dedupes and drops empties", () => {
    expect(normalizeEmailKeywords([" Error", "error", "", "FALHA "])).toEqual(["error", "falha"])
  })

  it("caps count and length", () => {
    expect(normalizeEmailKeywords(Array.from({ length: 20 }, (_, i) => `k${i}`))).toHaveLength(10)
    expect(normalizeEmailKeywords(["x".repeat(100)])[0]).toHaveLength(40)
  })
})

describe("emailRunBody", () => {
  it("keeps sender, subject and text, and truncates", () => {
    const body = emailRunBody(
      { from: "nas@acme.test", subject: "Backup ok", text: "line 1\r\nline 2\r\n" },
      1000,
    )
    expect(body).toBe("From: nas@acme.test\nSubject: Backup ok\n\nline 1\nline 2")
    expect(emailRunBody({ subject: "s", text: "x".repeat(50) }, 20)).toHaveLength(20)
  })
})
