import { ethers } from "hardhat"
import "hardhat-deploy"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployMastercopy } from "@gnosis.pm/zodiac"
import MODULE_CONTRACT_ARTIFACT from "../artifacts/contracts/MyModule.sol/MyModule.json"

const FirstAddress = "0x0000000000000000000000000000000000000001"
const Salt = "0x0000000000000000000000000000000000000000000000000000000000000000"

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const contract = await ethers.getContractFactory("MyModule")

  const address = await deployMastercopy(
    hre,
    contract,
    [
      FirstAddress, // owner
      FirstAddress, // button
    ],
    Salt,
  )

  if (address === ethers.constants.AddressZero) {
    console.log("Mastercopy already deployed")
  } else {
    console.log("Mastercopy deployed to:", address)
  }

  hre.deployments.save("MyModule", {
    abi: MODULE_CONTRACT_ARTIFACT.abi,
    address,
  })
}

deploy.tags = ["moduleMastercopy"]
export default deploy
