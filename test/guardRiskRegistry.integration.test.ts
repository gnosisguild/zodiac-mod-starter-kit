import { expect } from "chai"
import { ethers } from "hardhat"
import { time } from "@nomicfoundation/hardhat-network-helpers"

const Status = {
  UNSCORED: 0,
  LOW_RISK: 1,
  DELAYED: 2,
  HIGH_RISK: 3,
  FROZEN: 4,
}

const CALL = 0

async function setup() {
  const [owner, relayer, target, freezeAuthority] =
    await ethers.getSigners()

  // Use the REAL RiskRegistry.
  const RiskRegistry = await ethers.getContractFactory("RiskRegistry")
  const registry = await RiskRegistry.deploy(
    owner.address,
    relayer.address,
  )

  // Connect TripwireGuard to the REAL RiskRegistry.
  // owner acts as the Safe/avatar in these tests.
  const TripwireGuard = await ethers.getContractFactory("TripwireGuard")
  const guard = await TripwireGuard.deploy(
    owner.address,
    await registry.getAddress(),
    freezeAuthority.address,
    owner.address,
  )

  const to = target.address
  const value = 0n
  const data = "0x"

  const txHash = await guard.txHashOf(
    to,
    value,
    data,
    CALL,
  )

  const check = () =>
    guard.checkTransaction(
      to,
      value,
      data,
      CALL,
      0,
      0,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      "0x",
      owner.address,
    )

  return {
    owner,
    relayer,
    target,
    freezeAuthority,
    registry,
    guard,
    to,
    value,
    data,
    txHash,
    check,
  }
}

describe("TripwireGuard + RiskRegistry integration", function () {
  it("blocks a transaction with no verdict (fail-closed)", async function () {
    const { guard, txHash, check } = await setup()

    await expect(check())
      .to.be.revertedWithCustomError(guard, "AwaitingRiskScore")
      .withArgs(txHash)
  })

  it("allows a LOW_RISK transaction", async function () {
    const { registry, relayer, check, txHash } = await setup()

    await registry.connect(relayer).submitVerdict(txHash, {
      status: Status.LOW_RISK,
      score: 5,
      releaseAt: 0,
    })

    await expect(check()).to.not.be.reverted
  })

  it("blocks a HIGH_RISK transaction", async function () {
    const { registry, relayer, guard, check, txHash } = await setup()

    await registry.connect(relayer).submitVerdict(txHash, {
      status: Status.HIGH_RISK,
      score: 95,
      releaseAt: 0,
    })

    await expect(check())
      .to.be.revertedWithCustomError(guard, "BlockedHighRisk")
      .withArgs(txHash, 95)
  })

  it("delays a transaction until releaseAt", async function () {
    const { registry, relayer, guard, check, txHash } = await setup()

    const releaseAt = (await time.latest()) + 600

    await registry.connect(relayer).submitVerdict(txHash, {
      status: Status.DELAYED,
      score: 40,
      releaseAt,
    })

    await expect(check())
      .to.be.revertedWithCustomError(guard, "InCoolingOffWindow")
      .withArgs(txHash, releaseAt)

    await time.increaseTo(releaseAt)

    await expect(check()).to.not.be.reverted
  })

  it("blocks a transaction when the Guard is frozen", async function () {
    const { guard, registry, relayer, txHash, check } = await setup()

    await registry.connect(relayer).submitVerdict(txHash, {
      status: Status.LOW_RISK,
      score: 5,
      releaseAt: 0,
    })

    await guard.freeze()

    await expect(check())
      .to.be.revertedWithCustomError(guard, "GuardIsFrozen")
  })

  it("risk engine can change DELAYED to HIGH_RISK", async function () {
    const { registry, relayer, guard, check, txHash } = await setup()

    const releaseAt = (await time.latest()) + 600

    await registry.connect(relayer).submitVerdict(txHash, {
      status: Status.DELAYED,
      score: 40,
      releaseAt,
    })

    await expect(check())
      .to.be.revertedWithCustomError(guard, "InCoolingOffWindow")

    await registry.connect(relayer).submitVerdict(txHash, {
      status: Status.HIGH_RISK,
      score: 95,
      releaseAt: 0,
    })

    await expect(check())
      .to.be.revertedWithCustomError(guard, "BlockedHighRisk")
      .withArgs(txHash, 95)
  })

  it("over-limit transaction can be placed into DELAYED by the risk engine", async function () {
    const {
      guard,
      registry,
      relayer,
      to,
      owner,
    } = await setup()

    const value = 500n
    const data = "0x"

    // Configure a limit below the transaction value.
    await guard.setLimits(100n, 100000n)

    const txHash = await guard.txHashOf(
      to,
      value,
      data,
      CALL,
    )

    const releaseAt = (await time.latest()) + 600

    // The risk engine detects the limit breach and records DELAYED.
    await registry.connect(relayer).submitVerdict(txHash, {
      status: Status.DELAYED,
      score: 40,
      releaseAt,
    })

    const check = () =>
      guard.checkTransaction(
        to,
        value,
        data,
        CALL,
        0,
        0,
        0,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        "0x",
        owner.address,
      )

    // The DELAYED verdict is enforced by the Guard.
    await expect(check())
      .to.be.revertedWithCustomError(guard, "InCoolingOffWindow")
      .withArgs(txHash, releaseAt)
  })
})
