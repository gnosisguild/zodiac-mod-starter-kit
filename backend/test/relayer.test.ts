import { describe, expect, it, vi } from "vitest"

import type { RiskRegistryClient } from "../src/relayer.js"
import { VerdictRelayer } from "../src/relayer.js"
import type { RuleEngineResult } from "../src/ruleEngine.js"
import { RiskStatus } from "../src/verdict.js"

const TX_HASH = "0x1111111111111111111111111111111111111111111111111111111111111" as const

function ruleResult(overrides: Partial<RuleEngineResult> = {}): RuleEngineResult {
  return { score: 0, label: "low_risk", matchedSignals: [], ...overrides }
}

function mockClient(): { client: RiskRegistryClient; submitVerdict: ReturnType<typeof vi.fn> } {
  const submitVerdict = vi.fn(async () => {})
  return { client: { submitVerdict }, submitVerdict }
}

describe("VerdictRelayer", function () {
  it("submitFast writes a rule-engine-only verdict immediately, no LLM required", async function () {
    const { client, submitVerdict } = mockClient()
    const relayer = new VerdictRelayer(client)

    const verdict = await relayer.submitFast(TX_HASH, ruleResult({ score: 12, label: "low_risk" }))

    expect(verdict).toEqual({ status: RiskStatus.LOW_RISK, score: 12, releaseAt: 0 })
    expect(submitVerdict).toHaveBeenCalledWith(TX_HASH, verdict)
  })

  it("submitFinal without an LLM result submits the same thing submitFast would have", async function () {
    const { client } = mockClient()
    const relayer = new VerdictRelayer(client)
    const rule = ruleResult({ score: 40, label: "medium_risk" })

    const viaFast = await relayer.submitFast(TX_HASH, rule)
    const viaFinalNoLlm = await relayer.submitFinal(TX_HASH, rule, undefined)

    expect(viaFinalNoLlm.status).toBe(viaFast.status)
    expect(viaFinalNoLlm.score).toBe(viaFast.score)
  })

  it("submitFinal with an LLM result overwrites using the LLM's score and label", async function () {
    const { client, submitVerdict } = mockClient()
    const relayer = new VerdictRelayer(client)
    const rule = ruleResult({ score: 20, label: "low_risk" })

    const verdict = await relayer.submitFinal(TX_HASH, rule, { score: 95, label: "high_risk" })

    expect(verdict).toEqual({ status: RiskStatus.HIGH_RISK, score: 95, releaseAt: 0 })
    expect(submitVerdict).toHaveBeenCalledWith(TX_HASH, verdict)
  })

  it("a transaction is never left UNSCORED - submitFast never produces the UNSCORED status", async function () {
    const { client } = mockClient()
    const relayer = new VerdictRelayer(client)
    for (const label of ["low_risk", "medium_risk", "high_risk"] as const) {
      const verdict = await relayer.submitFast(TX_HASH, ruleResult({ label }))
      expect(verdict.status).not.toBe(RiskStatus.UNSCORED)
    }
  })
})
