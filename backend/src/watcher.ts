import type { PendingTx, RawPendingTx, SafeTxServiceClient } from "./types.js"

function normalize(raw: RawPendingTx): PendingTx {
  return {
    safeTxHash: raw.safeTxHash,
    to: raw.to,
    value: raw.value,
    data: raw.data ?? "0x",
    // The Transaction Service only started populating `proposer` directly
    // on newer versions; fall back to whoever signed first for older ones.
    proposer: raw.proposer ?? raw.confirmations?.[0]?.owner ?? "",
    nonce: raw.nonce,
  }
}

/**
 * Watches a single Safe's pending (proposed, not-yet-executed) transaction
 * queue and calls `onNewTx` exactly once per transaction, the first time it's
 * seen — this is the "Sense" step: it's the window where a transaction has
 * been proposed but not yet signed enough to execute, which is exactly when
 * the risk engine needs to score it and write a verdict.
 */
export class PendingTxWatcher {
  private readonly seen = new Set<string>()

  constructor(
    private readonly client: SafeTxServiceClient,
    private readonly safeAddress: string,
    private readonly onNewTx: (tx: PendingTx) => void,
  ) {}

  /** Runs one poll cycle, returning only the transactions that were new this cycle. */
  async pollOnce(): Promise<PendingTx[]> {
    const { results } = await this.client.getPendingTransactions(this.safeAddress)
    const fresh: PendingTx[] = []

    for (const raw of results) {
      if (this.seen.has(raw.safeTxHash)) continue
      this.seen.add(raw.safeTxHash)

      const tx = normalize(raw)
      fresh.push(tx)
      this.onNewTx(tx)
    }

    return fresh
  }

  /** Starts continuous polling. Returns the interval handle so callers can `clearInterval` it. */
  start(intervalMs: number): NodeJS.Timeout {
    return setInterval(() => {
      this.pollOnce().catch((err: unknown) => {
        console.error("[watcher] poll failed:", err)
      })
    }, intervalMs)
  }
}
