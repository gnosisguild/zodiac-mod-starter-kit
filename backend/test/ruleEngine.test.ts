import { describe, expect, it } from "vitest"

import { type RuleEngineInput, scoreTransaction } from "../src/ruleEngine.js"

// 32-byte (64 hex char) ABI words, built from real-length pieces rather than
// hand-counted literals - a single miscounted hex string here would silently
// shift every field after it and make the assertions below meaningless.
const pad32 = (hex: string): string => hex.padStart(64, "0")
const ADDRESS_HEX = "abcdefabcdefabcdefabcdefabcdefabcdefabcd" // 40 hex chars = 20 bytes
const ADDRESS_WORD = pad32(ADDRESS_HEX)
const MAX_UINT256_WORD = "f".repeat(64)
const SMALL_AMOUNT_WORD = pad32((100).toString(16))
const BOOL_TRUE_WORD = pad32("1")

const PLAIN_TRANSFER_DATA = "0x"
const SET_APPROVAL_FOR_ALL_DATA = `0xa22cb465${ADDRESS_WORD}${BOOL_TRUE_WORD}` // (address operator, bool true)
const UNLIMITED_APPROVE_DATA = `0x095ea7b3${ADDRESS_WORD}${MAX_UINT256_WORD}`
const LIMITED_APPROVE_DATA = `0x095ea7b3${ADDRESS_WORD}${SMALL_AMOUNT_WORD}`
const PERMIT_DATA = `0xd505accf${ADDRESS_WORD}${ADDRESS_WORD}${SMALL_AMOUNT_WORD}`

function baseInput(overrides: Partial<RuleEngineInput> = {}): RuleEngineInput {
  return {
    data: PLAIN_TRANSFER_DATA,
    value: 0n,
    isFirstSeenCounterparty: false,
    isUnverifiedOrFreshContract: false,
    historicalP95Value: 0n,
    ...overrides,
  }
}

describe("scoreTransaction", function () {
  it("builds well-formed 32-byte test fixtures (guards against hand-counted hex bugs)", function () {
    for (const word of [ADDRESS_WORD, MAX_UINT256_WORD, SMALL_AMOUNT_WORD, BOOL_TRUE_WORD]) {
      expect(word).toHaveLength(64)
    }
    expect(UNLIMITED_APPROVE_DATA).toHaveLength(2 + 8 + 64 + 64)
  })

  it("scores a plain transfer with none of the signals as low_risk with score 0", function () {
    const result = scoreTransaction(baseInput())
    expect(result).toEqual({ score: 0, label: "low_risk", matchedSignals: [] })
  })

  it("flags setApprovalForAll", function () {
    const result = scoreTransaction(baseInput({ data: SET_APPROVAL_FOR_ALL_DATA }))
    expect(result.score).toBe(45)
    expect(result.matchedSignals).toHaveLength(1)
    expect(result.matchedSignals[0]).toMatch(/setApprovalForAll/)
  })

  it("flags an unlimited approve, but not a limited one", function () {
    const unlimited = scoreTransaction(baseInput({ data: UNLIMITED_APPROVE_DATA }))
    expect(unlimited.score).toBe(40)
    expect(unlimited.matchedSignals[0]).toMatch(/unlimited/)

    const limited = scoreTransaction(baseInput({ data: LIMITED_APPROVE_DATA }))
    expect(limited.score).toBe(0)
    expect(limited.matchedSignals).toEqual([])
  })

  it("flags permit", function () {
    const result = scoreTransaction(baseInput({ data: PERMIT_DATA }))
    expect(result.score).toBe(25)
    expect(result.matchedSignals[0]).toMatch(/permit/)
  })

  it("flags a first-seen counterparty", function () {
    const result = scoreTransaction(baseInput({ isFirstSeenCounterparty: true }))
    expect(result.score).toBe(20)
  })

  it("flags an unverified or freshly-deployed contract", function () {
    const result = scoreTransaction(baseInput({ isUnverifiedOrFreshContract: true }))
    expect(result.score).toBe(25)
  })

  it("flags a value above the wallet's historical p95, but not below or at it", function () {
    const above = scoreTransaction(baseInput({ value: 200n, historicalP95Value: 100n }))
    expect(above.score).toBe(15)

    const atP95 = scoreTransaction(baseInput({ value: 100n, historicalP95Value: 100n }))
    expect(atP95.score).toBe(0)

    const noHistoryYet = scoreTransaction(baseInput({ value: 1_000_000n, historicalP95Value: 0n }))
    expect(noHistoryYet.score).toBe(0)
  })

  it("combines multiple signals and labels medium_risk in the 30-69 range", function () {
    const result = scoreTransaction(
      baseInput({ isFirstSeenCounterparty: true, isUnverifiedOrFreshContract: true }),
    )
    expect(result.score).toBe(45)
    expect(result.label).toBe("medium_risk")
    expect(result.matchedSignals).toHaveLength(2)
  })

  it("caps the combined score at 100 and labels high_risk at 70+", function () {
    const result = scoreTransaction({
      data: SET_APPROVAL_FOR_ALL_DATA,
      value: 500n,
      isFirstSeenCounterparty: true,
      isUnverifiedOrFreshContract: true,
      historicalP95Value: 100n,
    })
    // 45 + 20 + 25 + 15 = 105, capped
    expect(result.score).toBe(100)
    expect(result.label).toBe("high_risk")
    expect(result.matchedSignals).toHaveLength(4)
  })
})
