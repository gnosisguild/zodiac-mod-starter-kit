import { type Chain, createPublicClient, createTestClient, http, parseAbi } from "viem"

import type { ForkClient } from "./simulate.js"

const ERC20_ALLOWANCE_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
])
const NFT_IS_APPROVED_FOR_ALL_ABI = parseAbi([
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
])

export interface AnvilForkClientConfig {
  rpcUrl: string
  chain?: Chain
}

/**
 * Real `ForkClient` backed by a live Anvil instance via viem. Uses
 * `sendUnsignedTransaction` rather than impersonateAccount + a wallet
 * client - Anvil executes it regardless of signature, which is exactly
 * "run this as if the Safe sent it" without needing the Safe's key (which,
 * being a contract, it doesn't have one of anyway).
 */
export function createAnvilForkClient(config: AnvilForkClientConfig): ForkClient {
  const transport = http(config.rpcUrl)
  const publicClient = createPublicClient({ chain: config.chain, transport })
  const testClient = createTestClient({ mode: "anvil", chain: config.chain, transport })

  return {
    async getBalance(address) {
      return publicClient.getBalance({ address })
    },
    async readErc20Allowance(token, owner, spender) {
      return publicClient.readContract({
        address: token,
        abi: ERC20_ALLOWANCE_ABI,
        functionName: "allowance",
        args: [owner, spender],
      })
    },
    async readIsApprovedForAll(token, owner, spender) {
      return publicClient.readContract({
        address: token,
        abi: NFT_IS_APPROVED_FOR_ALL_ABI,
        functionName: "isApprovedForAll",
        args: [owner, spender],
      })
    },
    async snapshot() {
      return testClient.snapshot()
    },
    async revert(snapshotId) {
      await testClient.revert({ id: snapshotId as `0x${string}` })
    },
    async execute({ from, to, value, data }) {
      try {
        const hash = await testClient.sendUnsignedTransaction({ from, to, value, data })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        return { success: receipt.status === "success" }
      } catch {
        return { success: false }
      }
    },
  }
}
