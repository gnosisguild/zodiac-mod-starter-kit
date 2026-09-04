import { type Chain, createWalletClient, http, parseAbi } from "viem"
import { privateKeyToAccount } from "viem/accounts"

import type { RiskRegistryClient } from "./relayer.js"
import type { OnChainVerdict } from "./verdict.js"

const RISK_REGISTRY_ABI = parseAbi([
  "function submitVerdict(bytes32 txHash, (uint8 status, uint8 score, uint256 releaseAt) verdict) external",
])

export interface RiskRegistryClientConfig {
  /** The chain the RiskRegistry contract is deployed on, e.g. from `viem/chains` (sepolia), or a custom XDC Apothem definition. */
  chain: Chain
  rpcUrl: string
  contractAddress: `0x${string}`
  /** The relayer's private key. Read from an env var by the caller - never hardcode or commit this. */
  relayerPrivateKey: `0x${string}`
}

/**
 * Real on-chain implementation of `RiskRegistryClient`, backed by viem.
 * Deliberately thin and kept behind the same interface `relayer.ts` is
 * unit-tested against, for the same reason `safeApiClient.ts` wraps
 * `@safe-global/api-kit`: the relayer's actual verdict-combining logic is
 * fully tested with a mock; this file is the untestable-without-a-live-chain
 * remainder, kept as small as possible.
 */
export function createRiskRegistryClient(config: RiskRegistryClientConfig): RiskRegistryClient {
  const account = privateKeyToAccount(config.relayerPrivateKey)
  const walletClient = createWalletClient({
    account,
    chain: config.chain,
    transport: http(config.rpcUrl),
  })

  return {
    async submitVerdict(txHash: `0x${string}`, verdict: OnChainVerdict): Promise<void> {
      await walletClient.writeContract({
        address: config.contractAddress,
        abi: RISK_REGISTRY_ABI,
        functionName: "submitVerdict",
        args: [
          txHash,
          { status: verdict.status, score: verdict.score, releaseAt: BigInt(verdict.releaseAt) },
        ],
      })
    },
  }
}
