import type { RuleEngineResult } from "./ruleEngine.js"
import { type LlmVerdict, type OnChainVerdict, finalVerdict, verdictFromRuleEngine } from "./verdict.js"

/** The one contract call this module needs - implemented for real against RiskRegistry.sol via viem. */
export interface RiskRegistryClient {
  submitVerdict(txHash: `0x${string}`, verdict: OnChainVerdict): Promise<void>
}

/**
 * Writes verdicts to RiskRegistry. Two-phase by design: `submitFast` posts
 * the rule-engine-only verdict the moment it's computed (no I/O, so this is
 * always available within milliseconds); `submitFinal` posts an updated
 * verdict later if/when an LLM result (#12) comes in, which is allowed to
 * simply overwrite the fast one since RiskRegistry.submitVerdict has no
 * "already scored" guard. A transaction this relayer has seen is never left
 * UNSCORED - the fast path alone guarantees that.
 */
export class VerdictRelayer {
  constructor(private readonly client: RiskRegistryClient) {}

  async submitFast(txHash: `0x${string}`, ruleResult: RuleEngineResult): Promise<OnChainVerdict> {
    const verdict = verdictFromRuleEngine(ruleResult)
    await this.client.submitVerdict(txHash, verdict)
    return verdict
  }

  async submitFinal(
    txHash: `0x${string}`,
    ruleResult: RuleEngineResult,
    llm: LlmVerdict | undefined,
  ): Promise<OnChainVerdict> {
    const verdict = finalVerdict(ruleResult, llm)
    await this.client.submitVerdict(txHash, verdict)
    return verdict
  }
}
