import "hardhat-deploy"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { computeTargetAddress, deployMastercopy } from "@gnosis.pm/zodiac"
import MODULE_CONTRACT_ARTIFACT from "../artifacts/contracts/MyModule.sol/MyModule.json"

const FirstAddress = "0x0000000000000000000000000000000000000001"
const Salt = "0x0000000000000000000000000000000000000000000000000000000000000000"

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, ethers } = hre
  const { deployer_address } = await getNamedAccounts()
  const deployer = await ethers.getSigner(deployer_address)

  let address = await deployMastercopy(
    deployer,
    MODULE_CONTRACT_ARTIFACT,
    [
      FirstAddress, // owner
      FirstAddress, // button
    ],
    Salt,
  )

  if (address === ethers.ZeroAddress) {
    // the mastercopy was already deployed
    const target = await computeTargetAddress(
      deployer,
      MODULE_CONTRACT_ARTIFACT,
      [
        FirstAddress, // owner
        FirstAddress, // button
      ],
      Salt,
    )
    address = target.address
  }

  hre.deployments.save("MyModuleMastercopy", {
    abi: MODULE_CONTRACT_ARTIFACT.abi,
    address,
  })
}

deploy.tags = ["moduleMastercopy"]
export default deploy
