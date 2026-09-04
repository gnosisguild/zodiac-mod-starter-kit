/**
 * Deterministic, dependency-free risk scoring - the safety net this whole
 * system leans on when the LLM step (#12) is slow, erroring, or just not
 * wired up yet. No network calls, no external state: every signal here is
 * either decoded straight from calldata or handed in by the caller, who is
 * responsible for actually knowing the wallet's history (#8's watcher) and
 * the counterparty's reputation (#10's blacklist lookup, on-chain indexers,
 * etc.) - this module only combines signals into a score.
 */

export interface RuleEngineInput {
  /** The full calldata of the proposed transaction, e.g. "0xa22cb465...". */
  data: string
  /** Value of this specific transaction, in wei. */
  value: bigint
  /** True if this wallet has never sent a transaction to this counterparty before. */
  isFirstSeenCounterparty: boolean
  /** True if the target contract has no verified source, or was deployed very recently. */
  isUnverifiedOrFreshContract: boolean
  /** This wallet's historical p95 transaction value, in wei. 0n if there isn't enough history yet. */
  historicalP95Value: bigint
}

export type RiskLabel = "low_risk" | "medium_risk" | "high_risk"

export interface RuleEngineResult {
  /** 0-100, higher is riskier. */
  score: number
  label: RiskLabel
  /** Human-readable reasons, one per signal that fired - meant to double as LLM context and dashboard copy. */
  matchedSignals: string[]
}

// 4-byte function selectors this engine specifically watches for, because
// each is the standing-permission primitive behind most real drainer flows.
const SELECTOR_SET_APPROVAL_FOR_ALL = "0xa22cb465" // setApprovalForAll(address,bool)
const SELECTOR_APPROVE = "0x095ea7b3" // approve(address,uint256)
const SELECTOR_PERMIT = "0xd505accf" // permit(address,address,uint256,uint256,uint8,bytes32,bytes32) - EIP-2612

const MAX_UINT256_WORD = "f".repeat(64)

const WEIGHTS = {
  SET_APPROVAL_FOR_ALL: 45,
  UNLIMITED_APPROVE: 40,
  PERMIT: 25,
  FIRST_SEEN_COUNTERPARTY: 20,
  UNVERIFIED_OR_FRESH_CONTRACT: 25,
  ABOVE_HISTORICAL_P95: 15,
} as const

const HIGH_RISK_THRESHOLD = 70
const MEDIUM_RISK_THRESHOLD = 30

function selectorOf(data: string): string {
  return data.slice(0, 10).toLowerCase()
}

/** The `index`-th 32-byte (64 hex char) ABI-encoded word after the 4-byte selector. */
function wordAt(data: string, index: number): string {
  const start = 10 + index * 64
  return data.slice(start, start + 64).toLowerCase()
}

function isUnlimitedApprove(data: string): boolean {
  // approve(address spender, uint256 amount): word 0 is spender, word 1 is amount.
  return wordAt(data, 1) === MAX_UINT256_WORD
}

export function scoreTransaction(input: RuleEngineInput): RuleEngineResult {
  const matchedSignals: string[] = []
  let score = 0
  const selector = selectorOf(input.data)

  if (selector === SELECTOR_SET_APPROVAL_FOR_ALL) {
    score += WEIGHTS.SET_APPROVAL_FOR_ALL
    matchedSignals.push("setApprovalForAll: grants blanket control over an entire NFT collection")
  }

  if (selector === SELECTOR_APPROVE && isUnlimitedApprove(input.data)) {
    score += WEIGHTS.UNLIMITED_APPROVE
    matchedSignals.push("approve: unlimited (type(uint256).max) allowance")
  }

  if (selector === SELECTOR_PERMIT) {
    score += WEIGHTS.PERMIT
    matchedSignals.push("permit: off-chain signature granting an allowance, invisible to naive monitors")
  }

  if (input.isFirstSeenCounterparty) {
    score += WEIGHTS.FIRST_SEEN_COUNTERPARTY
    matchedSignals.push("first-seen counterparty: this wallet has never interacted with this address before")
  }

  if (input.isUnverifiedOrFreshContract) {
    score += WEIGHTS.UNVERIFIED_OR_FRESH_CONTRACT
    matchedSignals.push("target contract is unverified or was deployed very recently")
  }

  if (input.historicalP95Value > 0n && input.value > input.historicalP95Value) {
    score += WEIGHTS.ABOVE_HISTORICAL_P95
    matchedSignals.push("transaction value is above this wallet's historical p95 spend")
  }

  score = Math.min(score, 100)
  const label: RiskLabel =
    score >= HIGH_RISK_THRESHOLD ? "high_risk" : score >= MEDIUM_RISK_THRESHOLD ? "medium_risk" : "low_risk"

  return { score, label, matchedSignals }
}
