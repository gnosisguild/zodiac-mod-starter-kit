import { expect } from "chai"
import { ethers } from "hardhat"

const Status = { UNSCORED: 0, LOW_RISK: 1, DELAYED: 2, HIGH_RISK: 3, FROZEN: 4 }
const CALL = 0

/**
 * Proves the drainer demo (#14) actually exercises what the rule engine
 * (#9) and the Guard (#1) are built to catch - and, separately, that the
 * underlying exploit is real when nothing is watching. Full wiring through
 * a real Safe's execTransaction is #21's job; this is what's testable
 * without one.
 */
describe("drainer demo", function () {
  async function setup() {
    const [owner, victim, attackerEoa] = await ethers.getSigners()

    const nft = await (await ethers.getContractFactory("MockDrainableNFT")).deploy()
    const attacker = await (await ethers.getContractFactory("DrainerAttacker")).deploy()
    const registry = await (await ethers.getContractFactory("MockRiskRegistry")).deploy()
    const guard = await (
      await ethers.getContractFactory("TripwireGuard")
    ).deploy(owner.address, await registry.getAddress(), owner.address, owner.address)

    await nft.mint(victim.address) // tokenId 0

    const attackerAddress = await attacker.getAddress()
    const nftAddress = await nft.getAddress()
    const approvalData = nft.interface.encodeFunctionData("setApprovalForAll", [attackerAddress, true])
    const txHash = await guard.txHashOf(nftAddress, 0, approvalData, CALL)

    const checkApproval = () =>
      guard.checkTransaction(
        nftAddress,
        0,
        approvalData,
        CALL,
        0,
        0,
        0,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        "0x",
        owner.address,
      )

    return { owner, victim, attackerEoa, nft, attacker, registry, guard, nftAddress, attackerAddress, approvalData, txHash, checkApproval }
  }

  it("produces the exact malicious-shaped calldata the rule engine's signals target", async function () {
    const { approvalData } = await setup()
    expect(approvalData.slice(0, 10)).to.equal("0xa22cb465") // setApprovalForAll
  })

  it("the Guard blocks the drainer's approval before it can execute, with no verdict recorded", async function () {
    const { guard, checkApproval } = await setup()
    await expect(checkApproval()).to.be.revertedWithCustomError(guard, "AwaitingRiskScore")
  })

  it("the Guard blocks the drainer's approval even if the risk engine already scored it HIGH_RISK", async function () {
    const { guard, registry, txHash, checkApproval } = await setup()
    await registry.submitVerdict(txHash, { status: Status.HIGH_RISK, score: 96, releaseAt: 0 })
    await expect(checkApproval()).to.be.revertedWithCustomError(guard, "BlockedHighRisk")
  })

  it("without a Guard in the loop, the same calldata drains the NFT for real - this is exactly the pattern Tripwire exists to stop", async function () {
    const { nft, attacker, victim, nftAddress, attackerAddress } = await setup()

    expect(await nft.ownerOf(0)).to.equal(victim.address)

    // The victim (playing the role of an undefended Safe) signs the exact
    // same setApprovalForAll the Guard tests above blocked.
    await nft.connect(victim).setApprovalForAll(attackerAddress, true)
    // A few seconds later, as the proposal describes, the attacker drains it.
    await attacker.drain(nftAddress, victim.address, 0)

    expect(await nft.ownerOf(0)).to.equal(attackerAddress)
  })
})
