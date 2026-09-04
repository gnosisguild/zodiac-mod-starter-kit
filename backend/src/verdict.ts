import type { RiskLabel, RuleEngineResult } from "./ruleEngine.js"

/** Mirrors IRiskRegistry.Status in contracts/interfaces/IRiskRegistry.sol - keep these in sync. */
export const RiskStatus = {
  UNSCORED: 0,
  LOW_RISK: 1,
  DELAYED: 2,
  HIGH_RISK: 3,
  FROZEN: 4,
} as const

export type RiskStatusValue = (typeof RiskStatus)[keyof typeof RiskStatus]

/** Shape of IRiskRegistry.Verdict, in plain JS terms ready for a contract call. */
export interface OnChainVerdict {
  status: RiskStatusValue
  score: number
  releaseAt: number
}

/** How long a medium_risk verdict's cooling-off window lasts, in seconds. */
export const DEFAULT_DELAY_SECONDS = 10 * 60

function statusForLabel(label: RiskLabel): RiskStatusValue {
  switch (label) {
    case "low_risk":
      return RiskStatus.LOW_RISK
    case "high_risk":
      return RiskStatus.HIGH_RISK
    case "medium_risk":
      return RiskStatus.DELAYED
  }
}

/**
 * Builds the on-chain verdict for a rule-engine result. This is the verdict
 * the relayer submits immediately - no LLM call required - so a transaction
 * is never left UNSCORED for longer than one rule-engine pass takes, even if
 * the LLM step (#12) is slow, erroring, or not deployed yet.
 */
export function verdictFromRuleEngine(
  result: RuleEngineResult,
  options: { delaySeconds?: number; now?: () => number } = {},
): OnChainVerdict {
  const status = statusForLabel(result.label)
  const now = options.now ?? (() => Math.floor(Date.now() / 1000))
  const delaySeconds = options.delaySeconds ?? DEFAULT_DELAY_SECONDS

  return {
    status,
    score: result.score,
    releaseAt: status === RiskStatus.DELAYED ? now() + delaySeconds : 0,
  }
}

/**
 * Placeholder shape for #12's eventual LLM output - kept minimal and
 * type-only here so this module doesn't need to depend on #12 landing
 * first. When it does, its result plugs in as the `llm` argument below and
 * takes precedence over the rule engine, since it's judging context the
 * rule engine can't (see the proposal's AI-engine section).
 */
export interface LlmVerdict {
  score: number
  label: RiskLabel
}

/**
 * The verdict to submit once richer context is available. Prefers the LLM's
 * judgment when present; falls back to the rule engine's otherwise. Callers
 * doing the two-phase flow described in #13's acceptance criteria call
 * `verdictFromRuleEngine` immediately, then this once (if) an LLM result
 * arrives, so the relayer never blocks the fast path on a slow model call.
 */
export function finalVerdict(
  ruleResult: RuleEngineResult,
  llm: LlmVerdict | undefined,
  options: { delaySeconds?: number; now?: () => number } = {},
): OnChainVerdict {
  if (!llm) return verdictFromRuleEngine(ruleResult, options)
  return verdictFromRuleEngine({ score: llm.score, label: llm.label, matchedSignals: ruleResult.matchedSignals }, options)
}
