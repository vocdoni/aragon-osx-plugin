import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

import vocdoniVotingSetupArtifact from '../../../../artifacts/contracts/VocdoniVotingSetup.sol/VocdoniVotingSetup.json';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, ethers} = hre;
  const {deploy} = deployments;
  const [deployer] = await ethers.getSigners();

  await deploy('VocdoniVotingSetup', {
    contract: vocdoniVotingSetupArtifact,
    from: deployer.address,
    args: [],
    log: true,
  });
};
export default func;
func.tags = ['New', 'VocdoniVotingSetup'];
