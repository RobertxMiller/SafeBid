import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const safeBid = await deploy("SafeBid", {
    from: deployer,
    args: [], // SafeBid constructor has no arguments
    log: true,
    deterministicDeployment: false,
  });

  console.log(`SafeBid contract deployed at: ${safeBid.address}`);
  console.log(`Transaction hash: ${safeBid.transactionHash}`);
};

export default func;
func.id = "deploy_safebid";
func.tags = ["SafeBid"];