import { ethers } from "hardhat"
import "hardhat-deploy"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { computeTargetAddress, deployMastercopy } from "@gnosis.pm/zodiac"
import MODULE_CONTRACT_ARTIFACT from "../artifacts/contracts/MyModule.sol/MyModule.json"

const FirstAddress = "0x0000000000000000000000000000000000000001"
const Salt = "0x0000000000000000000000000000000000000000000000000000000000000000"

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const contract = await ethers.getContractFactory("MyModule")

  let address = await deployMastercopy(
    hre,
    contract,
    [
      FirstAddress, // owner
      FirstAddress, // button
    ],
    Salt,
  )

  if (address === ethers.constants.AddressZero) {
    // the mastercopy was already deployed
    const target = await computeTargetAddress(
      hre,
      contract,
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
