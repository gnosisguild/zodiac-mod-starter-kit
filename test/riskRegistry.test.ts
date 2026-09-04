import { expect } from "chai"
import { ethers } from "hardhat"

const Status = { UNSCORED: 0, LOW_RISK: 1, DELAYED: 2, HIGH_RISK: 3, FROZEN: 4 }

async function setup() {
  const [owner, relayer, other] = await ethers.getSigners()
  const RiskRegistry = await ethers.getContractFactory("RiskRegistry")
  const registry = await RiskRegistry.deploy(owner.address, relayer.address)
  const txHash = ethers.keccak256(ethers.toUtf8Bytes("some-safe-tx"))
  return { owner, relayer, other, registry, txHash }
}

describe("RiskRegistry", function () {
  it("defaults an unscored tx hash to Status.UNSCORED with no separate exists flag to get wrong", async function () {
    const { registry, txHash } = await setup()
    const v = await registry.verdictOf(txHash)
    expect(v.status).to.equal(Status.UNSCORED)
    expect(v.score).to.equal(0)
    expect(v.releaseAt).to.equal(0)
  })

  it("lets the relayer submit a verdict, readable back via verdictOf", async function () {
    const { registry, relayer, txHash } = await setup()
    await registry.connect(relayer).submitVerdict(txHash, { status: Status.HIGH_RISK, score: 91, releaseAt: 0 })
    const v = await registry.verdictOf(txHash)
    expect(v.status).to.equal(Status.HIGH_RISK)
    expect(v.score).to.equal(91)
  })

  it("rejects submitVerdict from anyone other than the relayer", async function () {
    const { registry, owner, other, txHash } = await setup()
    await expect(
      registry.connect(other).submitVerdict(txHash, { status: Status.LOW_RISK, score: 1, releaseAt: 0 }),
    ).to.be.revertedWithCustomError(registry, "NotRelayer").withArgs(other.address)
    await expect(
      registry.connect(owner).submitVerdict(txHash, { status: Status.LOW_RISK, score: 1, releaseAt: 0 }),
    ).to.be.revertedWithCustomError(registry, "NotRelayer").withArgs(owner.address)
  })

  it("lets the owner rotate the relayer address; old relayer loses access", async function () {
    const { registry, owner, relayer, other, txHash } = await setup()
    await registry.connect(owner).setRelayer(other.address)
    await expect(
      registry.connect(relayer).submitVerdict(txHash, { status: Status.LOW_RISK, score: 1, releaseAt: 0 }),
    ).to.be.revertedWithCustomError(registry, "NotRelayer")
    await expect(registry.connect(other).submitVerdict(txHash, { status: Status.LOW_RISK, score: 1, releaseAt: 0 }))
      .to.not.be.reverted
  })

  it("rejects setRelayer from a non-owner", async function () {
    const { registry, other } = await setup()
    await expect(registry.connect(other).setRelayer(other.address)).to.be.revertedWithCustomError(
      registry,
      "OwnableUnauthorizedAccount",
    )
  })
})
