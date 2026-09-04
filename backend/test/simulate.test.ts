import { describe, expect, it, vi } from "vitest"

import { type ForkClient, simulateTransaction } from "../src/simulate.js"

const SAFE = "0xSafe0000000000000000000000000000000000" as const
const TOKEN = "0xToken000000000000000000000000000000000" as const
const ATTACKER = "0xAttacker0000000000000000000000000000000" as const

/** A mock whose "after" state only reflects reality once `execute` has run and `revert` hasn't yet. */
function statefulMockClient(overrides: Partial<ForkClient> = {}): ForkClient {
  let balance = 1000n
  let approved = false
  let executed = false
  let reverted = false

  return {
    getBalance: vi.fn(async () => balance),
    readErc20Allowance: vi.fn(async () => 0n),
    readIsApprovedForAll: vi.fn(async () => approved),
    snapshot: vi.fn(async () => "0x1"),
    revert: vi.fn(async () => {
      reverted = true
      // A real revert would also roll balance/approved back; irrelevant
      // here since nothing reads state again after revert in this mock.
    }),
    execute: vi.fn(async () => {
      if (reverted) throw new Error("execute called after revert - snapshot ordering is broken")
      executed = true
      approved = true
      balance -= 1n // e.g. gas-equivalent side effect, just to give balance a diff to detect
      return { success: true }
    }),
    ...overrides,
  }
}

describe("simulateTransaction", function () {
  it("reports before/after state and always reverts, even though a real revert would erase the change", async function () {
    const client = statefulMockClient()

    const diff = await simulateTransaction(client, {
      from: SAFE,
      to: TOKEN,
      value: 0n,
      data: "0xa22cb465",
      watchTokens: [{ address: TOKEN, standard: "nft", spender: ATTACKER }],
    })

    expect(diff.success).toBe(true)
    expect(diff.balanceBefore).toBe(1000n)
    expect(diff.balanceAfter).toBe(999n)
    expect(diff.newAllowances).toEqual([{ token: TOKEN, spender: ATTACKER, standard: "nft", before: 0n, after: 1n }])
    expect(client.revert).toHaveBeenCalledWith("0x1")
  })

  it("reverts even when the simulated call fails", async function () {
    const client = statefulMockClient({ execute: vi.fn(async () => ({ success: false })) })
    const diff = await simulateTransaction(client, { from: SAFE, to: TOKEN, value: 0n, data: "0x" })
    expect(diff.success).toBe(false)
    expect(client.revert).toHaveBeenCalledWith("0x1")
  })

  it("reverts even when the client throws mid-simulation", async function () {
    const client = statefulMockClient({
      execute: vi.fn(async () => {
        throw new Error("boom")
      }),
    })
    await expect(simulateTransaction(client, { from: SAFE, to: TOKEN, value: 0n, data: "0x" })).rejects.toThrow(
      "boom",
    )
    expect(client.revert).toHaveBeenCalledWith("0x1")
  })

  it("omits tokens whose allowance didn't change", async function () {
    const client = statefulMockClient({ execute: vi.fn(async () => ({ success: true })) }) // approved stays false
    const diff = await simulateTransaction(client, {
      from: SAFE,
      to: TOKEN,
      value: 0n,
      data: "0x",
      watchTokens: [{ address: TOKEN, standard: "nft", spender: ATTACKER }],
    })
    expect(diff.newAllowances).toEqual([])
  })

  it("checks erc20 allowance via readErc20Allowance, not readIsApprovedForAll", async function () {
    const readErc20Allowance = vi.fn().mockResolvedValueOnce(0n).mockResolvedValueOnce(500n)
    const client = statefulMockClient({ readErc20Allowance })
    const diff = await simulateTransaction(client, {
      from: SAFE,
      to: TOKEN,
      value: 0n,
      data: "0x",
      watchTokens: [{ address: TOKEN, standard: "erc20", spender: ATTACKER }],
    })
    expect(readErc20Allowance).toHaveBeenCalledWith(TOKEN, SAFE, ATTACKER)
    expect(diff.newAllowances).toEqual([{ token: TOKEN, spender: ATTACKER, standard: "erc20", before: 0n, after: 500n }])
  })
})
