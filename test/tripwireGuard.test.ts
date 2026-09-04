import { expect } from "chai"
import { ethers } from "hardhat"
import { time } from "@nomicfoundation/hardhat-network-helpers"

// Mirrors IRiskRegistry.Status: UNSCORED, LOW_RISK, DELAYED, HIGH_RISK, FROZEN
const Status = { UNSCORED: 0, LOW_RISK: 1, DELAYED: 2, HIGH_RISK: 3, FROZEN: 4 }
const CALL = 0 // Enum.Operation.Call

async function setup() {
  const [owner, target, freezeAuthority] = await ethers.getSigners()

  const MockRiskRegistry = await ethers.getContractFactory("MockRiskRegistry")
  const registry = await MockRiskRegistry.deploy()

  const TripwireGuard = await ethers.getContractFactory("TripwireGuard")
  // `owner` doubles as the avatar (the Safe) here: every checkTransaction /
  // checkAfterExecution call in these tests uses the default signer, which
  // is `owner`, satisfying onlyAvatar without a separate mock Safe.
  const guard = await TripwireGuard.deploy(
    owner.address,
    await registry.getAddress(),
    freezeAuthority.address,
    owner.address,
  )

  const to = target.address
  const value = 0n
  const data = "0x"
  const txHash = await guard.txHashOf(to, value, data, CALL)

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

  // Builds a distinct (to, value, data) tuple so each call gets its own
  // txHash, pre-approves it as LOW_RISK in the registry, and returns a
  // checker for it — used by the limits tests below, where each amount
  // needs its own verdict the same way a real pending tx would.
  const approvedCheck = async (checkValue: bigint, salt = 0) => {
    const checkData = salt === 0 ? "0x" : ethers.solidityPacked(["uint256"], [salt])
    const checkTxHash = await guard.txHashOf(to, checkValue, checkData, CALL)
    await registry.submitVerdict(checkTxHash, { status: Status.LOW_RISK, score: 5, releaseAt: 0 })
    const run = () =>
      guard.checkTransaction(
        to,
        checkValue,
        checkData,
        CALL,
        0,
        0,
        0,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        "0x",
        owner.address,
      )
    return { txHash: checkTxHash, run }
  }

  return { owner, freezeAuthority, registry, guard, to, value, data, txHash, check, approvedCheck }
}

describe("TripwireGuard", function () {
  it("blocks a transaction with no recorded verdict (fail-closed default)", async function () {
    const { guard, txHash, check } = await setup()
    await expect(check()).to.be.revertedWithCustomError(guard, "AwaitingRiskScore").withArgs(txHash)
  })

  it("allows a transaction with a LOW_RISK verdict", async function () {
    const { registry, txHash, check } = await setup()
    await registry.submitVerdict(txHash, { status: Status.LOW_RISK, score: 5, releaseAt: 0 })
    await expect(check()).to.not.be.reverted
  })

  it("blocks a transaction with a HIGH_RISK verdict", async function () {
    const { guard, registry, txHash, check } = await setup()
    await registry.submitVerdict(txHash, { status: Status.HIGH_RISK, score: 92, releaseAt: 0 })
    await expect(check()).to.be.revertedWithCustomError(guard, "BlockedHighRisk").withArgs(txHash, 92)
  })

  it("blocks a DELAYED transaction until its releaseAt, then allows it", async function () {
    const { guard, registry, txHash, check } = await setup()
    const releaseAt = (await time.latest()) + 600
    await registry.submitVerdict(txHash, { status: Status.DELAYED, score: 40, releaseAt })

    await expect(check()).to.be.revertedWithCustomError(guard, "InCoolingOffWindow").withArgs(txHash, releaseAt)

    await time.increaseTo(releaseAt)
    await expect(check()).to.not.be.reverted
  })

  it("lets the risk engine cancel a DELAYED transaction mid-window by overwriting its verdict to HIGH_RISK", async function () {
    // checkTransaction always reads the *current* verdict for a tx hash, not
    // a snapshot taken when it was first delayed - so the off-chain risk
    // engine cancelling a transaction it's now more suspicious of is just
    // another RiskRegistry.submitVerdict call, nothing Guard-side to build.
    const { guard, registry, txHash, check } = await setup()
    const releaseAt = (await time.latest()) + 600
    await registry.submitVerdict(txHash, { status: Status.DELAYED, score: 40, releaseAt })
    await expect(check()).to.be.revertedWithCustomError(guard, "InCoolingOffWindow").withArgs(txHash, releaseAt)

    // Risk engine sees something new mid-window and cancels it outright.
    await registry.submitVerdict(txHash, { status: Status.HIGH_RISK, score: 95, releaseAt: 0 })

    // Still within the original cooling-off window, but now blocked for a
    // different reason - HIGH_RISK, not the expired timer.
    await expect(check()).to.be.revertedWithCustomError(guard, "BlockedHighRisk").withArgs(txHash, 95)

    // And it stays blocked even after the original releaseAt passes.
    await time.increaseTo(releaseAt)
    await expect(check()).to.be.revertedWithCustomError(guard, "BlockedHighRisk").withArgs(txHash, 95)
  })

  it("blocks everything while frozen, even a LOW_RISK verdict", async function () {
    const { guard, registry, txHash, check } = await setup()
    await registry.submitVerdict(txHash, { status: Status.LOW_RISK, score: 0, releaseAt: 0 })
    await guard.freeze()
    await expect(check()).to.be.revertedWithCustomError(guard, "GuardIsFrozen")
  })

  it("only the owner can unfreeze or update the risk registry", async function () {
    const { guard, registry } = await setup()
    const [, , , other] = await ethers.getSigners()
    await guard.freeze()
    await expect(guard.connect(other).unfreeze()).to.be.revertedWithCustomError(guard, "OwnableUnauthorizedAccount")
    await expect(
      guard.connect(other).setRiskRegistry(await registry.getAddress()),
    ).to.be.revertedWithCustomError(guard, "OwnableUnauthorizedAccount")
  })

  it("lets the freeze authority (risk engine relayer) trip the breaker, but not lift it", async function () {
    const { guard, freezeAuthority } = await setup()
    await expect(guard.connect(freezeAuthority).freeze()).to.not.be.reverted
    expect(await guard.frozen()).to.equal(true)
    await expect(guard.connect(freezeAuthority).unfreeze()).to.be.revertedWithCustomError(
      guard,
      "OwnableUnauthorizedAccount",
    )
  })

  it("rejects freeze() from an address that is neither owner nor freeze authority", async function () {
    const { guard } = await setup()
    const [, , , other] = await ethers.getSigners()
    await expect(guard.connect(other).freeze())
      .to.be.revertedWithCustomError(guard, "NotOwnerOrFreezeAuthority")
      .withArgs(other.address)
  })

  it("only the owner can rotate the freeze authority", async function () {
    const { guard } = await setup()
    const [, , , other] = await ethers.getSigners()
    await expect(guard.connect(other).setFreezeAuthority(other.address)).to.be.revertedWithCustomError(
      guard,
      "OwnableUnauthorizedAccount",
    )
    await expect(guard.setFreezeAuthority(other.address)).to.not.be.reverted
    await expect(guard.connect(other).freeze()).to.not.be.reverted
  })

  it("rejects checkTransaction and checkAfterExecution from anyone other than the avatar", async function () {
    const { guard, registry, txHash, to, value, data } = await setup()
    await registry.submitVerdict(txHash, { status: Status.LOW_RISK, score: 0, releaseAt: 0 })
    const [, , , other] = await ethers.getSigners()

    await expect(
      guard
        .connect(other)
        .checkTransaction(to, value, data, CALL, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, "0x", other.address),
    ).to.be.revertedWithCustomError(guard, "NotAvatar")

    await expect(guard.connect(other).checkAfterExecution(txHash, true)).to.be.revertedWithCustomError(
      guard,
      "NotAvatar",
    )
  })

  it("only the owner can update the avatar", async function () {
    const { guard } = await setup()
    const [, , , other] = await ethers.getSigners()
    await expect(guard.connect(other).setAvatar(other.address)).to.be.revertedWithCustomError(
      guard,
      "OwnableUnauthorizedAccount",
    )
  })

  describe("limits", function () {
    // Simulates the Safe's real call sequence: checkTransaction before the
    // inner call, checkAfterExecution(success) after it - only that second
    // step is what actually records spend against the rolling window.
    const execute = async (guard: any, run: () => Promise<any>, txHash: string) => {
      await run()
      await guard.checkAfterExecution(txHash, true)
    }

    it("allows a transaction under both limits and records its spend once executed", async function () {
      const { guard, approvedCheck } = await setup()
      await guard.setLimits(100n, 1000n)
      const { run, txHash } = await approvedCheck(50n)
      await expect(execute(guard, run, txHash)).to.not.be.reverted
      expect(await guard.windowSpent()).to.equal(50n)
    })

    it("reverts outright on a transaction over the per-tx limit - it does not get to spend at all", async function () {
      const { guard, approvedCheck } = await setup()
      await guard.setLimits(100n, 100000n)
      const { txHash, run } = await approvedCheck(500n)
      await expect(run()).to.be.revertedWithCustomError(guard, "PerTxLimitExceeded").withArgs(txHash, 500n, 100n)
      expect(await guard.windowSpent()).to.equal(0n)
    })

    it("reverts on a transaction that would push the rolling 24h total over its limit, even though it's under the per-tx limit", async function () {
      const { guard, approvedCheck } = await setup()
      await guard.setLimits(1000n, 600n)

      const first = await approvedCheck(400n, 1)
      await expect(execute(guard, first.run, first.txHash)).to.not.be.reverted
      expect(await guard.windowSpent()).to.equal(400n)

      // 400 + 300 = 700 > 600 rolling limit, even though 300 < perTxLimit on its own.
      const second = await approvedCheck(300n, 2)
      await expect(second.run())
        .to.be.revertedWithCustomError(guard, "RollingLimitExceeded")
        .withArgs(second.txHash, 700n, 600n)
      // The rejected attempt never spent anything - the running total is unchanged.
      expect(await guard.windowSpent()).to.equal(400n)
    })

    it("resets the rolling window 24 hours after the first spend in it", async function () {
      const { guard, approvedCheck } = await setup()
      await guard.setLimits(1000n, 600n)

      const first = await approvedCheck(500n, 1)
      await expect(execute(guard, first.run, first.txHash)).to.not.be.reverted
      expect(await guard.windowSpent()).to.equal(500n)

      await time.increase(await guard.ROLLING_WINDOW())
      expect(await guard.windowSpent()).to.equal(0n) // stale window reads back as spent-nothing

      const second = await approvedCheck(500n, 2)
      await expect(execute(guard, second.run, second.txHash)).to.not.be.reverted
      expect(await guard.windowSpent()).to.equal(500n)
    })

    it("does not count a reverted inner execution against the rolling limit", async function () {
      const { guard, approvedCheck } = await setup()
      await guard.setLimits(1000n, 600n)
      const { txHash, run } = await approvedCheck(500n)
      await run()
      await guard.checkAfterExecution(txHash, false)
      expect(await guard.windowSpent()).to.equal(0n)
    })

    it("only the owner can update limits", async function () {
      const { guard } = await setup()
      const [, , , other] = await ethers.getSigners()
      await expect(guard.connect(other).setLimits(1n, 1n)).to.be.revertedWithCustomError(
        guard,
        "OwnableUnauthorizedAccount",
      )
    })
  })
})
