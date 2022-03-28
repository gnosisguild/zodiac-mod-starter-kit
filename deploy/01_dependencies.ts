import "hardhat-deploy"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const deploy: DeployFunction = async function ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) {
  console.log("Deploying 'external' dependencies")
  const { deploy } = deployments
  const { dependenciesDeployer } = await getNamedAccounts()

  const mocSafeDeployment = await deploy("MockSafe", {
    from: dependenciesDeployer,
  })
  console.log("Mock Safe deployed to:", mocSafeDeployment.address)

  const buttonDeployment = await deploy("Button", {
    from: dependenciesDeployer,
    args: [mocSafeDeployment.address],
  })
  console.log("Button deployed to:", buttonDeployment.address)
}

deploy.tags = ["dependencies"]
export default deploy
