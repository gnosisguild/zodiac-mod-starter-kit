import "hardhat-deploy"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployAndSetUpCustomModule, ContractAddresses, KnownContracts, SupportedNetworks } from "@gnosis.pm/zodiac"
import MODULE_CONTRACT_ARTIFACT from "../artifacts/contracts/MyModule.sol/MyModule.json"

const deploy: DeployFunction = async function ({
  deployments,
  getNamedAccounts,
  ethers,
  getChainId,
}: HardhatRuntimeEnvironment) {
  console.log("Deploying MyModule Proxy")
  const { deployer } = await getNamedAccounts()
  const deployerSigner = await ethers.getSigner(deployer)

  const buttonDeployment = await deployments.get("Button")
  const testAvatarDeployment = await deployments.get("TestAvatar")

  const myModuleMastercopyDeployment = await deployments.get("MyModuleMastercopy")

  const chainId = await getChainId()
  const network: SupportedNetworks = Number(chainId)

  if ((await ethers.provider.getCode(ContractAddresses[network][KnownContracts.FACTORY])) === "0x") {
    // the Module Factory should already be deployed to all supported chains
    // if you are deploying to a chain where its not deployed yet (most likely locale test chains), run deployModuleFactory from the zodiac package
    throw Error("The Module Factory is not deployed on this network. Please deploy it first.")
  }

  console.log("buttonDeployment.address:", buttonDeployment.address)

  const { transaction } = deployAndSetUpCustomModule(
    myModuleMastercopyDeployment.address,
    myModuleMastercopyDeployment.abi,
    {
      values: [testAvatarDeployment.address, buttonDeployment.address],
      types: ["address", "address"],
    },
    ethers.provider,
    Number(chainId),
    Date.now().toString(),
  )
  const deploymentTransaction = await deployerSigner.sendTransaction(transaction)
  const receipt = await deploymentTransaction.wait()
  const myModuleProxyAddress = receipt.logs[1].address
  console.log("MyModule minimal proxy deployed to:", myModuleProxyAddress)

  deployments.save("MyModuleProxy", {
    abi: MODULE_CONTRACT_ARTIFACT.abi,
    address: myModuleProxyAddress,
  })

  // Enable MyModule as a module on the safe to give it access to the safe's execTransactionFromModule() function
  const testAvatarContract = await ethers.getContractAt("TestAvatar", testAvatarDeployment.address, deployerSigner)
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
