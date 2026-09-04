import { describe, expect, it, vi } from "vitest"

import type { RawPendingTx, SafeTxServiceClient } from "../src/types.js"
import { PendingTxWatcher } from "../src/watcher.js"

const SAFE = "0xSafe0000000000000000000000000000000000"

function mockClient(...batches: RawPendingTx[][]): SafeTxServiceClient {
  let call = 0
  return {
    getPendingTransactions: vi.fn(async () => {
      const results = batches[Math.min(call, batches.length - 1)]
      call += 1
      return { results }
    }),
  }
}

function raw(overrides: Partial<RawPendingTx> = {}): RawPendingTx {
  return {
    safeTxHash: "0xhash1",
    to: "0xTarget00000000000000000000000000000000",
    value: "1000000000000000000",
    data: "0xabcdef",
    nonce: "3",
    proposer: "0xProposer0000000000000000000000000000000",
    ...overrides,
  }
}

describe("PendingTxWatcher", function () {
  it("normalizes and emits every pending tx on the first poll", async function () {
    const client = mockClient([raw()])
    const seen: unknown[] = []
    const watcher = new PendingTxWatcher(client, SAFE, (tx) => seen.push(tx))

    const fresh = await watcher.pollOnce()

    expect(fresh).toEqual([
      {
        safeTxHash: "0xhash1",
        to: "0xTarget00000000000000000000000000000000",
        value: "1000000000000000000",
        data: "0xabcdef",
        proposer: "0xProposer0000000000000000000000000000000",
        nonce: "3",
      },
    ])
    expect(seen).toEqual(fresh)
  })

  it("defaults missing data to 0x", async function () {
    const client = mockClient([raw({ data: null })])
    const watcher = new PendingTxWatcher(client, SAFE, () => {})
    const [tx] = await watcher.pollOnce()
    expect(tx.data).toBe("0x")
  })

  it("falls back to the first confirmation's owner when proposer is absent", async function () {
    const client = mockClient([
      raw({ proposer: null, confirmations: [{ owner: "0xFirstSigner000000000000000000000000000" }] }),
    ])
    const watcher = new PendingTxWatcher(client, SAFE, () => {})
    const [tx] = await watcher.pollOnce()
    expect(tx.proposer).toBe("0xFirstSigner000000000000000000000000000")
  })

  it("does not re-emit a transaction already seen in a previous poll", async function () {
    const client = mockClient([raw()], [raw()])
    const onNewTx = vi.fn()
    const watcher = new PendingTxWatcher(client, SAFE, onNewTx)

    await watcher.pollOnce()
    const second = await watcher.pollOnce()

    expect(second).toEqual([])
    expect(onNewTx).toHaveBeenCalledTimes(1)
  })

  it("emits only the newly-appeared transaction when the queue grows", async function () {
    const client = mockClient([raw({ safeTxHash: "0xhash1" })], [
      raw({ safeTxHash: "0xhash1" }),
      raw({ safeTxHash: "0xhash2", nonce: "4" }),
    ])
    const onNewTx = vi.fn()
    const watcher = new PendingTxWatcher(client, SAFE, onNewTx)

    await watcher.pollOnce()
    const second = await watcher.pollOnce()

    expect(second).toHaveLength(1)
    expect(second[0].safeTxHash).toBe("0xhash2")
    expect(onNewTx).toHaveBeenCalledTimes(2)
  })
})
