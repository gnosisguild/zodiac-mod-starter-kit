import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

import MODULE_CONTRACT_ARTIFACT from "../build/artifacts/contracts/MyModule.sol/MyModule.json"
import createAdapter from "./eip1193"
import { deployFactories, deployProxy } from "zodiac-core"

const deploy: DeployFunction = async function ({
  deployments,
  getNamedAccounts,
  ethers,
  network,
}: HardhatRuntimeEnvironment) {
  console.log("Deploying MyModule Proxy")
  const { deployer: deployerAddress } = await getNamedAccounts()
  const deployer = await ethers.getSigner(deployerAddress)

  const buttonDeployment = await deployments.get("Button")
  const testAvatarDeployment = await deployments.get("TestAvatar")
  const myModuleMastercopyDeployment = await deployments.get("MyModuleMastercopy")

  const provider = createAdapter({
    provider: network.provider,
    signer: await ethers.getSigner(deployerAddress),
  })
  
  console.log("buttonDeployment.address:", buttonDeployment.address)

  // Deploys the ModuleFactory (and the Singleton factory) if it is not already deployed
  await deployFactories({ provider })
  const { address: myModuleProxyAddress } = await deployProxy({
    mastercopy: myModuleMastercopyDeployment.address,
    setupArgs: {
      values: [testAvatarDeployment.address, buttonDeployment.address],
      types: ["address", "address"],
    },
    saltNonce: 0,
    provider,
  })

  console.log("MyModule minimal proxy deployed to:", myModuleProxyAddress)

  deployments.save("MyModuleProxy", {
    abi: MODULE_CONTRACT_ARTIFACT.abi,
    address: myModuleProxyAddress,
  })

  // Enable MyModule as a module on the safe to give it access to the safe's execTransactionFromModule() function
  const testAvatarContract = await ethers.getContractAt("TestAvatar", testAvatarDeployment.address, deployer)
  const currentActiveModule = await testAvatarContract.module()
  if (currentActiveModule !== myModuleProxyAddress) {
    const tx = await testAvatarContract.enableModule(myModuleProxyAddress)
    tx.wait()
    console.log("MyModule proxy enabled on the TestAvatar")
  } else {
    console.log("MyModule proxy already enabled on the TestAvatar")
  }
}

deploy.tags = ["moduleProxy"]
deploy.dependencies = ["moduleMastercopy", "testDependencies"]

export default deploy
