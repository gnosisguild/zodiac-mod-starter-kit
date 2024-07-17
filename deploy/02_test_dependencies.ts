import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("Deploying 'external' dependencies (Button and Avatar)")
  const { deployments, getNamedAccounts, ethers } = hre
  const { deploy } = deployments
  const { deployer: deployerAddress } = await getNamedAccounts()
  const deployer = await ethers.getSigner(deployerAddress)

  const testAvatarDeployment = await deploy("TestAvatar", {
    from: deployerAddress,
  })
  console.log("TestAvatar deployed to:", testAvatarDeployment.address)

  const buttonDeployment = await deploy("Button", {
    from: deployerAddress,
  })
  console.log("Button deployed to:", buttonDeployment.address)

  // Make the TestAvatar the owner of the button
  const buttonContract = await ethers.getContractAt("Button", buttonDeployment.address, deployer)
  const currentOwner = await buttonContract.owner()
  if (currentOwner !== testAvatarDeployment.address) {
    const tx = await buttonContract.transferOwnership(testAvatarDeployment.address)
    tx.wait()
    console.log("TestAvatar set as owner of the button")
  } else {
    console.log("Owner of button is already set correctly")
  }
}

deploy.tags = ["testDependencies"]
export default deploy
