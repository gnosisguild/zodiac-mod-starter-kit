import { ZeroHash } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployFactories, deploySingleton } from "zodiac-core"

import createAdapter from "./eip1193"
import MODULE_CONTRACT_ARTIFACT from "../artifacts/contracts/MyModule.sol/MyModule.json"

const FirstAddress = "0x0000000000000000000000000000000000000001"

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, ethers } = hre
  const { deployer: deployerAddress } = await getNamedAccounts()

  const provider = createAdapter({
    provider: hre.network.provider,
    signer: await ethers.getSigner(deployerAddress),
  })

  await deployFactories({ provider })

  const MyModule = await ethers.getContractFactory("MyModule")

  const { address: mastercopy } = await deploySingleton({
    bytecode: MyModule.bytecode,
    constructorArgs: { types: ["address", "address"], values: [FirstAddress, FirstAddress] },
    salt: ZeroHash,
    provider,
  })

  hre.deployments.save("MyModuleMastercopy", {
    abi: MODULE_CONTRACT_ARTIFACT.abi,
    address: mastercopy,
  })
}

deploy.tags = ["moduleMastercopy"]
export default deploy
