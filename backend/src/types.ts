/** A pending Safe transaction, normalized to just what the risk engine needs. */
export interface PendingTx {
  safeTxHash: string
  to: string
  value: string
  data: string
  proposer: string
  nonce: string
}

/**
 * The subset of Safe Transaction Service's `SafeMultisigTransactionResponse`
 * (see @safe-global/api-kit) this module reads. Kept narrow and separate
 * from the SDK's own type so the watcher can be unit-tested against a
 * plain mock instead of a live API client.
 */
export interface RawPendingTx {
  safeTxHash: string
  to: string
  value: string
  data?: string | null
  nonce: string
  proposer?: string | null
  confirmations?: Array<{ owner: string }>
}

/** The one method the watcher needs from @safe-global/api-kit's SafeApiKit. */
export interface SafeTxServiceClient {
  getPendingTransactions(safeAddress: string): Promise<{ results: RawPendingTx[] }>
}
