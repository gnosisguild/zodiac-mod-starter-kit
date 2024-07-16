import "hardhat-deploy"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployModuleFactory } from "@gnosis.pm/zodiac"
import { ethers } from "ethers"

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log("Deploying 'external' dependencies (Button and Avatar)")
  const { deployments, getNamedAccounts, ethers } = hre
  const { deploy } = deployments
  const { deployer_address } = await getNamedAccounts()
  const deployer = await ethers.provider.getSigner(deployer_address)

  // Deploys the ModuleFactory (and the Singleton factory) if it is not already deployed
  await deployModuleFactory(deployer)

  const testAvatarDeployment = await deploy("TestAvatar", {
    from: deployer_address,
  })
  console.log("TestAvatar deployed to:", testAvatarDeployment.address)

  const buttonDeployment = await deploy("Button", {
    from: deployer_address,
  })
  console.log("Button deployed to:", buttonDeployment.address)

  // Make the TestAvatar the owner of the button
  const dependenciesDeployerSigner = await ethers.getSigner(deployer_address)
  const buttonContract = await ethers.getContractAt("Button", buttonDeployment.address, dependenciesDeployerSigner)
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
