import { expect } from "chai"
import { ethers, deployments, getNamedAccounts } from "hardhat"

const setup = async () => {
  await deployments.fixture(["moduleProxy"])
  const { tester } = await getNamedAccounts()
  const testSigner = await ethers.getSigner(tester)
  const buttonDeployment = await deployments.get("Button")
  const myModuleProxyDeployment = await deployments.get("MyModuleProxy")
  const buttonContract = await ethers.getContractAt("Button", buttonDeployment.address, testSigner)
  const myModuleProxyContract = await ethers.getContractAt("MyModule", myModuleProxyDeployment.address, testSigner)
  return { buttonContract, myModuleProxyContract }
}

describe("MyModule", function () {
  it("Should be possible to 'press the button' through MyModule", async function () {
    const { buttonContract, myModuleProxyContract } = await setup()
    expect(await buttonContract.pushes()).to.equal(0)
    await myModuleProxyContract.pushButton()
    expect(await buttonContract.pushes()).to.equal(1)
  })
  it("Should NOT be possible to 'press the button' directly on the Button contract", async function () {
    const { buttonContract } = await setup()
    await expect(buttonContract.pushButton()).to.revertedWith("Ownable: caller is not the owner")
  })
})
