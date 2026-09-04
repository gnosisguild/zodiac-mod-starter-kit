import { describe, expect, it, vi } from "vitest"

import type { BlockTx, DecodedSafeCall, OnchainClient, SafeExecDecoder } from "../src/onchainAttemptWatcher.js"
import { OnchainAttemptWatcher } from "../src/onchainAttemptWatcher.js"

const SAFE = "0xSafe0000000000000000000000000000000000" as const
const OTHER_CONTRACT = "0xOther000000000000000000000000000000000" as const
const SENDER = "0xSender0000000000000000000000000000000000" as const

function tx(overrides: Partial<BlockTx> = {}): BlockTx {
  return { from: SENDER, to: SAFE, input: "0xdeadbeef", nonce: 0, ...overrides }
}

function mockClient(...blocks: BlockTx[][]): OnchainClient {
  let latest = -1n
  const byBlock = new Map<string, BlockTx[]>()
  blocks.forEach((txs, i) => {
    latest = BigInt(i)
    byBlock.set(String(i), txs)
  })
  return {
    getLatestBlockNumber: vi.fn(async () => latest),
    getBlockTransactions: vi.fn(async (n: bigint) => byBlock.get(n.toString()) ?? []),
  }
}

/** Decodes anything as a fixed call, unless input is exactly "0x" (not a Safe call). */
function fixedDecoder(call: DecodedSafeCall): SafeExecDecoder {
  return {
    decode: vi.fn((input: `0x${string}`) => (input === "0x" ? null : call)),
    txHashOf: vi.fn((c: DecodedSafeCall) => `0xhash-${c.to}-${c.value}` as `0x${string}`),
  }
}

const CALL: DecodedSafeCall = {
  to: OTHER_CONTRACT,
  value: 0n,
  data: "0xa22cb465",
  operation: 0,
}

describe("OnchainAttemptWatcher", function () {
  it("emits a normalized PendingTx for an execTransaction attempt in the first poll", async function () {
    const client = mockClient([tx()])
    const decoder = fixedDecoder(CALL)
    const seen: unknown[] = []
    const watcher = new OnchainAttemptWatcher(client, decoder, SAFE, (t) => seen.push(t))

    const fresh = await watcher.pollOnce()

    expect(fresh).toEqual([
      {
        safeTxHash: `0xhash-${OTHER_CONTRACT}-0`,
        to: OTHER_CONTRACT,
        value: "0",
        data: "0xa22cb465",
        proposer: SENDER,
        nonce: "0",
      },
    ])
    expect(seen).toEqual(fresh)
  })

  it("ignores transactions not addressed to the Safe", async function () {
    const client = mockClient([tx({ to: OTHER_CONTRACT })])
    const watcher = new OnchainAttemptWatcher(client, fixedDecoder(CALL), SAFE, () => {})
    expect(await watcher.pollOnce()).toEqual([])
  })

  it("ignores transactions to the Safe that aren't execTransaction calls", async function () {
    const client = mockClient([tx({ input: "0x" })])
    const watcher = new OnchainAttemptWatcher(client, fixedDecoder(CALL), SAFE, () => {})
    expect(await watcher.pollOnce()).toEqual([])
  })

  it("counts a reverted attempt the same as a successful one - both are worth scoring", async function () {
    // The watcher only sees `to`/`input`, not receipt status, by design:
    // whether it reverted (fail-closed, no verdict yet) or somehow
    // succeeded, the underlying (to, value, data) is equally worth scoring
    // for next time / for the record.
    const client = mockClient([tx()])
    const watcher = new OnchainAttemptWatcher(client, fixedDecoder(CALL), SAFE, () => {})
    expect(await watcher.pollOnce()).toHaveLength(1)
  })

  it("does not re-emit the same safeTxHash across polls, even from different outer transactions", async function () {
    const client = mockClient([tx()], [tx({ nonce: 1 })]) // same decoded call both times -> same safeTxHash
    const onNewTx = vi.fn()
    const watcher = new OnchainAttemptWatcher(client, fixedDecoder(CALL), SAFE, onNewTx)

    await watcher.pollOnce()
    const second = await watcher.pollOnce()

    expect(second).toEqual([])
    expect(onNewTx).toHaveBeenCalledTimes(1)
  })

  it("starts from the current latest block on its first poll, not full history", async function () {
    // Two blocks already exist (0 and 1) before the watcher ever starts -
    // it should only look at block 1, the latest, not replay block 0 too.
    const client = mockClient([tx()], [tx({ nonce: 1 })])
    await new OnchainAttemptWatcher(client, fixedDecoder(CALL), SAFE, () => {}).pollOnce()
    expect(client.getBlockTransactions).toHaveBeenCalledTimes(1)
    expect(client.getBlockTransactions).toHaveBeenCalledWith(1n)
  })

  it("on a later poll, only scans blocks newer than the last one it already saw", async function () {
    const client = mockClient([tx()], [tx({ nonce: 1 })], [tx({ nonce: 2 })])
    const watcher = new OnchainAttemptWatcher(client, fixedDecoder(CALL), SAFE, () => {})

    await watcher.pollOnce() // catches up to block 2 (the latest of 0,1,2)
    vi.mocked(client.getBlockTransactions).mockClear()

    await watcher.pollOnce() // no new blocks appeared - should scan nothing
    expect(client.getBlockTransactions).not.toHaveBeenCalled()
  })
})
