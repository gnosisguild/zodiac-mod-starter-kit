import "dotenv/config"

import { createSafeApiClient } from "./safeApiClient.js"
import type { PendingTx } from "./types.js"
import { PendingTxWatcher } from "./watcher.js"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const safeAddress = requireEnv("SAFE_ADDRESS")
const chainId = BigInt(requireEnv("CHAIN_ID"))
const txServiceUrl = process.env.TX_SERVICE_URL
const apiKey = process.env.SAFE_TX_SERVICE_API_KEY
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? 5000)

const client = createSafeApiClient({ chainId, txServiceUrl, apiKey })

// Placeholder consumer until #9 (rule engine) lands - logs every newly-seen
// pending transaction so this is independently runnable and verifiable now.
function onNewTx(tx: PendingTx): void {
  console.log("[watcher] new pending tx", tx)
}

const watcher = new PendingTxWatcher(client, safeAddress, onNewTx)

console.log(
  `[watcher] watching Safe ${safeAddress} on chain ${chainId} every ${pollIntervalMs}ms`,
)
watcher.pollOnce().catch((err: unknown) => console.error("[watcher] initial poll failed:", err))
watcher.start(pollIntervalMs)
