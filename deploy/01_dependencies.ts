import "hardhat-deploy"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const deploy: DeployFunction = async function ({ deployments, getNamedAccounts, ethers }: HardhatRuntimeEnvironment) {
  console.log("Deploying 'external' dependencies")
  const { deploy } = deployments
  const { dependenciesDeployer } = await getNamedAccounts()

  const mocSafeDeployment = await deploy("MockSafe", {
    from: dependenciesDeployer,
  })
  console.log("Mock Safe deployed to:", mocSafeDeployment.address)

  const buttonDeployment = await deploy("Button", {
    from: dependenciesDeployer,
  })
  console.log("Button deployed to:", buttonDeployment.address)

  // Make the mocSafe the owner of the button
  const dependenciesDeployerSigner = await ethers.getSigner(dependenciesDeployer)
  const buttonContract = await ethers.getContractAt("Button", buttonDeployment.address, dependenciesDeployerSigner)
  const currentOwner = await buttonContract.owner()
  if (currentOwner !== mocSafeDeployment.address) {
    const tx = await buttonContract.transferOwnership(mocSafeDeployment.address)
    tx.wait()
    console.log("MocSafe set as owner of the button")
  } else {
    console.log("Owner of button is already set correctly")
  }
}

deploy.tags = ["dependencies"]
export default deploy
