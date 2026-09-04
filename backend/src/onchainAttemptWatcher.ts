import type { PendingTx } from "./types.js"

/** A transaction as read back from a block - the fields this watcher needs. */
export interface BlockTx {
  from: `0x${string}`
  to: `0x${string}` | null
  input: `0x${string}`
  nonce: number
}

export interface OnchainClient {
  getLatestBlockNumber(): Promise<bigint>
  getBlockTransactions(blockNumber: bigint): Promise<BlockTx[]>
}

export interface DecodedSafeCall {
  to: `0x${string}`
  value: bigint
  data: `0x${string}`
  operation: number
}

/** Decodes a Safe's `execTransaction` calldata and computes the same hash TripwireGuard.txHashOf() computes on-chain. */
export interface SafeExecDecoder {
  decode(input: `0x${string}`): DecodedSafeCall | null
  txHashOf(call: DecodedSafeCall): `0x${string}`
}

/**
 * Alternative "Sense" step for chains without a Safe Transaction Service
 * (XDC Apothem - see #38). Without Safe's off-chain proposal relay, a
 * signer just calls `execTransaction` directly; the Guard's existing
 * fail-closed default blocks the first attempt since no verdict exists yet.
 * This watches confirmed blocks for those attempts - successful or
 * reverted, it doesn't matter which - decodes the underlying
 * (to, value, data, operation) straight out of the calldata, and emits it
 * in the exact same `PendingTx` shape #8's Safe-API watcher produces, so
 * the rule engine (#9) and relayer (#13) need zero changes to consume it.
 */
export class OnchainAttemptWatcher {
  private lastBlock: bigint | null = null
  private readonly seen = new Set<string>()

  constructor(
    private readonly client: OnchainClient,
    private readonly decoder: SafeExecDecoder,
    private readonly safeAddress: `0x${string}`,
    private readonly onNewTx: (tx: PendingTx) => void,
  ) {}

  async pollOnce(): Promise<PendingTx[]> {
    const latest = await this.client.getLatestBlockNumber()
    const from = this.lastBlock === null ? latest : this.lastBlock + 1n
    const fresh: PendingTx[] = []

    for (let b = from; b <= latest; b++) {
      const txs = await this.client.getBlockTransactions(b)
      for (const tx of txs) {
        if (!tx.to || tx.to.toLowerCase() !== this.safeAddress.toLowerCase()) continue

        const decoded = this.decoder.decode(tx.input)
        if (!decoded) continue

        const safeTxHash = this.decoder.txHashOf(decoded)
        if (this.seen.has(safeTxHash)) continue
        this.seen.add(safeTxHash)

        const normalized: PendingTx = {
          safeTxHash,
          to: decoded.to,
          value: decoded.value.toString(),
          data: decoded.data,
          // No off-chain signer info without Safe's relay - this is
          // literally who broadcast the execTransaction call.
          proposer: tx.from,
          nonce: tx.nonce.toString(),
        }
        fresh.push(normalized)
        this.onNewTx(normalized)
      }
    }

    this.lastBlock = latest
    return fresh
  }

  start(intervalMs: number): NodeJS.Timeout {
    return setInterval(() => {
      this.pollOnce().catch((err: unknown) => {
        console.error("[onchain-watcher] poll failed:", err)
      })
    }, intervalMs)
  }
}
