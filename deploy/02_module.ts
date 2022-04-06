import "hardhat-deploy"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const deploy: DeployFunction = async function ({ deployments, getNamedAccounts, ethers }: HardhatRuntimeEnvironment) {
  console.log("Deploying MyModule")
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const buttonDeployment = await deployments.get("Button")
  const mockSafeDeployment = await deployments.get("MockSafe")

  const myModuleDeployment = await deploy("MyModule", {
    from: deployer,
    args: [mockSafeDeployment.address, buttonDeployment.address],
  })
  console.log("MyModule deployed to:", myModuleDeployment.address)

  // Enable MyModule as a module on the safe to give it access to the safe's execTransactionFromModule() function
  const deployerSigner = await ethers.getSigner(deployer)
  const mockSafeContract = await ethers.getContractAt("MockSafe", mockSafeDeployment.address, deployerSigner)
  const currntActiveModule = await mockSafeContract.module()
  if (currntActiveModule !== myModuleDeployment.address) {
    const tx = await mockSafeContract.enableModule(myModuleDeployment.address)
    tx.wait()
    console.log("MyModule enabled on the MockSafe.")
  } else {
    console.log("MyModule already enabled on the MockSafe.")
  }
}

deploy.tags = ["MyModule"]
deploy.dependencies = ["dependencies"]

export default deploy
