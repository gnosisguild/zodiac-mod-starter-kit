/**
 * Manual smoke test for createAnvilForkClient - not part of the automated
 * suite (vitest doesn't spin up a real Anvil instance), but a quick way for
 * anyone setting up their local environment for #21 to confirm their Anvil
 * + viem combination actually behaves the way simulate.ts assumes it does.
 *
 * Usage:
 *   anvil --port 8546 &
 *   RPC_URL=http://127.0.0.1:8546 npx tsx scripts/verifyAnvilFork.ts
 */
import { createAnvilForkClient } from "../src/anvilForkClient.js"
import { simulateTransaction } from "../src/simulate.js"

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8546"

// Anvil's well-known default first two accounts (same on every fresh instance).
const FROM = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const
const TO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const

async function main() {
  const client = createAnvilForkClient({ rpcUrl: RPC_URL })

  const realBalanceBefore = await client.getBalance(FROM)
  console.log("Real balance before:", realBalanceBefore)

  const diff = await simulateTransaction(client, { from: FROM, to: TO, value: 1_000_000_000_000_000_000n, data: "0x" })
  console.log("Simulation result:", diff)

  const realBalanceAfter = await client.getBalance(FROM)
  console.log("Real balance after (should equal 'before' - simulation must not persist):", realBalanceAfter)

  if (realBalanceAfter !== realBalanceBefore) {
    throw new Error("Simulation leaked state past the revert - this is a real bug, not a demo detail.")
  }
  if (diff.balanceAfter >= diff.balanceBefore) {
    throw new Error("Simulation did not observe the balance decreasing during execution.")
  }

  console.log("\nOK: simulation observed the change, and left zero trace on real chain state.")
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
