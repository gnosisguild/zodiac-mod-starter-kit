/** Manual cross-check: does TripwireGuard.txHashOf() match the TS-side computation onchainAttemptWatcher will use? */
import { ethers } from "hardhat"

async function main() {
  const registry = await (await ethers.getContractFactory("MockRiskRegistry")).deploy()
  const [owner] = await ethers.getSigners()
  const guard = await (
    await ethers.getContractFactory("TripwireGuard")
  ).deploy(owner.address, await registry.getAddress(), owner.address, owner.address)

  const to = "0x1234567890123456789012345678901234567890"
  const value = 1000000000000000000n
  const data =
    "0xa22cb465000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd0000000000000000000000000000000000000000000000000000000000000001"
  const operation = 0

  const solidityHash = await guard.txHashOf(to, value, data, operation)
  console.log("Solidity hash:", solidityHash)
  console.log("Expected (from TS-side computation): 0xf41b0759a35c98cbf616e224706158c77a16bccba4924e8a73618888053f8243")
  console.log(solidityHash.toLowerCase() === "0xf41b0759a35c98cbf616e224706158c77a16bccba4924e8a73618888053f8243" ? "MATCH" : "MISMATCH")
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
