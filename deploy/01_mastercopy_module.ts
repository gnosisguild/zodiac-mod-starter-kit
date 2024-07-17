import { ZeroHash } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { createFactory, deployViaFactory } from "../factories/eip2470"

import MODULE_CONTRACT_ARTIFACT from "../artifacts/contracts/MyModule.sol/MyModule.json"

const FirstAddress = "0x0000000000000000000000000000000000000001"

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, ethers } = hre
  const { deployer: deployerAddress } = await getNamedAccounts()
  const deployer = await ethers.getSigner(deployerAddress)

  await createFactory(deployer)

  const MyModule = await ethers.getContractFactory("MyModule")
  const tx = await MyModule.getDeployTransaction(FirstAddress, FirstAddress)

  const mastercopy = await deployViaFactory({ bytecode: tx.data, salt: ZeroHash }, deployer)

  hre.deployments.save("MyModuleMastercopy", {
    abi: MODULE_CONTRACT_ARTIFACT.abi,
    address: mastercopy,
  })
}

deploy.tags = ["moduleMastercopy"]
export default deploy
