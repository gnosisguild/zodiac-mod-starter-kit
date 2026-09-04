import { decodeFunctionData, encodeAbiParameters, keccak256, parseAbi } from "viem"

import type { DecodedSafeCall, SafeExecDecoder } from "./onchainAttemptWatcher.js"

const SAFE_EXEC_TRANSACTION_ABI = parseAbi([
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)",
])

/**
 * Real decoder, backed by viem. `txHashOf` here is verified (not assumed)
 * to match `TripwireGuard.txHashOf()` bit-for-bit - see
 * scripts/verifyTxHashMatch.manual.ts in the contracts project, which
 * cross-checks the same inputs against the deployed Solidity function.
 * This has to be exact: RiskRegistry keys every verdict by this hash.
 */
export function createSafeExecDecoder(): SafeExecDecoder {
  return {
    decode(input) {
      try {
        const { functionName, args } = decodeFunctionData({ abi: SAFE_EXEC_TRANSACTION_ABI, data: input })
        if (functionName !== "execTransaction") return null
        const [to, value, data, operation] = args
        return { to, value, data, operation }
      } catch {
        return null
      }
    },
    txHashOf(call: DecodedSafeCall) {
      return keccak256(
        encodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }, { type: "bytes" }, { type: "uint8" }],
          [call.to, call.value, call.data, call.operation],
        ),
      )
    },
  }
}
