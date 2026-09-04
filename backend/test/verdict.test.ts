import { describe, expect, it } from "vitest"

import type { RuleEngineResult } from "../src/ruleEngine.js"
import { RiskStatus, finalVerdict, verdictFromRuleEngine } from "../src/verdict.js"

function ruleResult(overrides: Partial<RuleEngineResult> = {}): RuleEngineResult {
  return { score: 0, label: "low_risk", matchedSignals: [], ...overrides }
}

const FIXED_NOW = 1_700_000_000

describe("verdictFromRuleEngine", function () {
  it("maps low_risk to LOW_RISK with no releaseAt", function () {
    const v = verdictFromRuleEngine(ruleResult({ score: 5, label: "low_risk" }))
    expect(v).toEqual({ status: RiskStatus.LOW_RISK, score: 5, releaseAt: 0 })
  })

  it("maps high_risk to HIGH_RISK with no releaseAt", function () {
    const v = verdictFromRuleEngine(ruleResult({ score: 90, label: "high_risk" }))
    expect(v).toEqual({ status: RiskStatus.HIGH_RISK, score: 90, releaseAt: 0 })
  })

  it("maps medium_risk to DELAYED with a releaseAt in the future", function () {
    const v = verdictFromRuleEngine(ruleResult({ score: 45, label: "medium_risk" }), {
      now: () => FIXED_NOW,
      delaySeconds: 600,
    })
    expect(v).toEqual({ status: RiskStatus.DELAYED, score: 45, releaseAt: FIXED_NOW + 600 })
  })

  it("uses a caller-supplied delay window", function () {
    const v = verdictFromRuleEngine(ruleResult({ label: "medium_risk" }), {
      now: () => FIXED_NOW,
      delaySeconds: 3600,
    })
    expect(v.releaseAt).toBe(FIXED_NOW + 3600)
  })
})

describe("finalVerdict", function () {
  it("falls back to the rule engine's verdict when there is no LLM result", function () {
    const rule = ruleResult({ score: 20, label: "low_risk" })
    expect(finalVerdict(rule, undefined, { now: () => FIXED_NOW })).toEqual(
      verdictFromRuleEngine(rule, { now: () => FIXED_NOW }),
    )
  })

  it("prefers the LLM's score and label over the rule engine's when present", function () {
    const rule = ruleResult({ score: 20, label: "low_risk", matchedSignals: ["first-seen counterparty"] })
    const v = finalVerdict(rule, { score: 88, label: "high_risk" }, { now: () => FIXED_NOW })
    expect(v).toEqual({ status: RiskStatus.HIGH_RISK, score: 88, releaseAt: 0 })
  })
})
