/**
 * Fork simulation - the "does this calldata actually do what it claims"
 * check. Replays a proposed transaction against a snapshot of real chain
 * state and reports what changed, so the rule engine and the LLM step both
 * get to see ground truth instead of trusting the calldata's face value.
 *
 * The snapshot/revert dance matters: this must never leave a lasting effect
 * on the fork, since the same fork is shared for scoring many pending
 * transactions and the watcher (#8) keeps polling it for real state. Note
 * the ordering this forces: "after" state has to be read *before* the
 * revert call, not after - an earlier draft of this got that backwards and
 * would have silently reported every simulation as a no-op change, since by
 * the time it read "after" the revert had already restored "before".
 */

export interface WatchedToken {
  address: `0x${string}`
  /** erc20 checks an `allowance`; nft checks `isApprovedForAll`. */
  standard: "erc20" | "nft"
  spender: `0x${string}`
}

export interface SimulateTxInput {
  /** The account whose state we're simulating changes for - the Safe. */
  from: `0x${string}`
  to: `0x${string}`
  value: bigint
  data: `0x${string}`
  /** Tokens the calldata might touch - the caller decides which are worth checking (e.g. the token this approve/setApprovalForAll targets). */
  watchTokens?: WatchedToken[]
}

export interface AllowanceDiff {
  token: `0x${string}`
  spender: `0x${string}`
  standard: "erc20" | "nft"
  /** uint256 allowance for erc20, 0n/1n (false/true) for nft's isApprovedForAll. */
  before: bigint
  after: bigint
}

export interface SimulationDiff {
  balanceBefore: bigint
  balanceAfter: bigint
  /** Only entries where before !== after - a token nothing changed for isn't worth reporting. */
  newAllowances: AllowanceDiff[]
  /** False if the inner call reverted - the calldata doesn't even do what it claims to. */
  success: boolean
}

/**
 * The handful of chain operations this module needs, narrowed to an
 * interface so the diff logic (`simulateTransaction`, the part worth
 * testing without a live chain) is separate from the live Anvil-talking
 * client (`createAnvilForkClient`) - same split as `watcher.ts` /
 * `safeApiClient.ts` and `relayer.ts` / `riskRegistryClient.ts`.
 *
 * `snapshot`/`revert`/`execute` are exposed as distinct steps, deliberately
 * not bundled into one "simulate" call - the orchestration in
 * `simulateTransaction` below needs to read chain state *between* executing
 * the call and reverting it.
 */
export interface ForkClient {
  getBalance(address: `0x${string}`): Promise<bigint>
  readErc20Allowance(token: `0x${string}`, owner: `0x${string}`, spender: `0x${string}`): Promise<bigint>
  readIsApprovedForAll(token: `0x${string}`, owner: `0x${string}`, spender: `0x${string}`): Promise<boolean>
  snapshot(): Promise<string>
  revert(snapshotId: string): Promise<void>
  /** Executes the call as `input.from` against current chain state. Does not itself snapshot or revert. */
  execute(input: { from: `0x${string}`; to: `0x${string}`; value: bigint; data: `0x${string}` }): Promise<{
    success: boolean
  }>
}

async function readAllowancesFor(
  client: ForkClient,
  owner: `0x${string}`,
  tokens: WatchedToken[],
): Promise<Map<string, bigint>> {
  const values = new Map<string, bigint>()
  for (const t of tokens) {
    const key = `${t.address}:${t.spender}`
    if (t.standard === "erc20") {
      values.set(key, await client.readErc20Allowance(t.address, owner, t.spender))
    } else {
      values.set(key, (await client.readIsApprovedForAll(t.address, owner, t.spender)) ? 1n : 0n)
    }
  }
  return values
}

export async function simulateTransaction(client: ForkClient, input: SimulateTxInput): Promise<SimulationDiff> {
  const watchTokens = input.watchTokens ?? []
  const snapshotId = await client.snapshot()

  try {
    const balanceBefore = await client.getBalance(input.from)
    const before = await readAllowancesFor(client, input.from, watchTokens)

    const { success } = await client.execute({ from: input.from, to: input.to, value: input.value, data: input.data })

    // Read "after" now, before the snapshot is reverted in `finally` below -
    // this is the ordering the module doc comment warns about.
    const balanceAfter = await client.getBalance(input.from)
    const after = await readAllowancesFor(client, input.from, watchTokens)

    const newAllowances: AllowanceDiff[] = []
    for (const t of watchTokens) {
      const key = `${t.address}:${t.spender}`
      const b = before.get(key) ?? 0n
      const a = after.get(key) ?? 0n
      if (a !== b) {
        newAllowances.push({ token: t.address, spender: t.spender, standard: t.standard, before: b, after: a })
      }
    }

    return { balanceBefore, balanceAfter, newAllowances, success }
  } finally {
    await client.revert(snapshotId)
  }
}
