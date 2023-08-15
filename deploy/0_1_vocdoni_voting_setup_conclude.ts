import {DeployFunction} from 'hardhat-deploy/types';
import {VocdoniVotingSetup__factory} from '../typechain';
import {setTimeout} from 'timers/promises';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log(`Concluding vocdoni voting setup deployment.\n`);
  const [deployer] = await hre.ethers.getSigners();

  const {deployments, network} = hre;

  const VocdoniVotingSetupDeployment = await deployments.get('VocdoniVotingSetup');
  const vocdoniVotingSetup = VocdoniVotingSetup__factory.connect(
    VocdoniVotingSetupDeployment.address,
    deployer
  );

  // add a timeout for polygon because the call to `implementation()` can fail for newly deployed contracts in the first few seconds
  if (network.name === 'polygon') {
    console.log(`Waiting 30secs for ${network.name} to finish up...`);
    await setTimeout(30000);
  }

  hre.aragonToVerifyContracts.push(
    await hre.deployments.get('GovernanceERC20')
  );

  hre.aragonToVerifyContracts.push(
    await hre.deployments.get('GovernanceWrappedERC20')
  );

  hre.aragonToVerifyContracts.push(VocdoniVotingSetupDeployment);
  hre.aragonToVerifyContracts.push({
    address: await vocdoniVotingSetup.implementation(),
    args: [],
  });
};

export default func;
func.tags = ['New', 'VocdoniVotingSetup', 'Verify'];