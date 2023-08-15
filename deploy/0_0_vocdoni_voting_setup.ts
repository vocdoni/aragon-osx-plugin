import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

import governanceERC20Artifact from '../artifacts/@aragon/osx/token/ERC20/governance/GovernanceERC20.sol/GovernanceERC20.json';
import governanceWrappedERC20Artifact from '../artifacts/@aragon/osx/token/ERC20/governance/GovernanceWrappedERC20.sol/GovernanceWrappedERC20.json';
import vocdoniVotingSetupArtifact from '../artifacts/contracts/VocdoniVotingSetup.sol/VocdoniVotingSetup.json';

export type MintSettings = {
    receivers: string[];
    amounts: number[];
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, ethers} = hre;
  const {deploy} = deployments;
  const [deployer] = await ethers.getSigners();

  const zeroDaoAddress = ethers.constants.AddressZero;
  const zeroTokenAddress = ethers.constants.AddressZero;
  const emptyName = '';
  const emptySymbol = '';
  const emptyMintSettings: MintSettings = {
    receivers: [],
    amounts: [],
  };

  // Deploy the bases for the VocdoniVotingSetup
  const governanceERC20DeployResult = await deploy('GovernanceERC20', {
    contract: governanceERC20Artifact,
    from: deployer.address,
    args: [zeroDaoAddress, emptyName, emptySymbol, emptyMintSettings],
    log: true,
  });

  const governanceWrappedERC20DeployResult = await deploy(
    'GovernanceWrappedERC20',
    {
      contract: governanceWrappedERC20Artifact,
      from: deployer.address,
      args: [zeroTokenAddress, emptyName, emptySymbol],
      log: true,
    }
  );

  // Deploy the VocdoniVotingSetup and provide the bases in the constructor
  await deploy('VocdoniVotingSetup', {
    contract: vocdoniVotingSetupArtifact,
    from: deployer.address,
    args: [
      governanceERC20DeployResult.address,
      governanceWrappedERC20DeployResult.address,
    ],
    log: true,
  });
};
export default func;
func.tags = ['New', 'VocdoniVotingSetup'];