import SafeApiKitPkg from "@safe-global/api-kit"

import type { SafeTxServiceClient } from "./types.js"

export interface SafeApiClientConfig {
  chainId: bigint
  /** Optional self-hosted or alternate Transaction Service URL. */
  txServiceUrl?: string
  /** Required by api.safe.global / api.5afe.dev — get one at developer.safe.global. */
  apiKey?: string
}

// @safe-global/api-kit's dual CJS/ESM "exports" field (with a single shared
// .d.ts across both conditions) trips up TS's NodeNext module resolution
// into losing the default export's construct signature, even though the
// runtime export is a plain `export default class`. Verified directly:
// `(await import("@safe-global/api-kit")).default` is a constructable
// function at runtime; this cast just tells TS what's already true.
const SafeApiKit = SafeApiKitPkg as unknown as new (config: SafeApiClientConfig) => SafeTxServiceClient

/**
 * Thin wrapper around @safe-global/api-kit's SafeApiKit, narrowed to the
 * `SafeTxServiceClient` interface the watcher depends on. Keeping the real
 * SDK behind this interface (rather than importing SafeApiKit directly in
 * watcher.ts) is what lets the watcher's tests run against a plain mock
 * instead of hitting a live Transaction Service.
 */
export function createSafeApiClient(config: SafeApiClientConfig): SafeTxServiceClient {
  return new SafeApiKit(config)
}
