import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {PluginRepo__factory} from '../../../typechain';
import {getContractAddress, uploadToIPFS} from '../helpers';

import vocdoniVotingSetupArtifact from '../../../artifacts/contracts/VocdoniVoting.sol/VocdoniVoting.json';

import vocdoniVotingReleaseMetadata from '../../../contracts/release-metadata.json';
import vocdoniVotingBuildMetadata from '../../../contracts/build-metadata.json';
import {UPDATE_INFOS} from '../../../utils/types';

const TARGET_RELEASE = 1;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log('\nUpdate VocdoniVoting Plugin');
  const {deployments, ethers, network} = hre;
  const {deploy} = deployments;
  const [deployer] = await ethers.getSigners();

  const deployResult = await deploy('VocdoniVotingSetup', {
    contract: vocdoniVotingSetupArtifact,
    from: deployer.address,
    args: [],
    log: true,
  });

  const vocdoniVotingReleaseCIDPath = await uploadToIPFS(
    JSON.stringify(vocdoniVotingReleaseMetadata),
    network.name
  );
  const vocdoniVotingBuildCIDPath = await uploadToIPFS(
    JSON.stringify(vocdoniVotingBuildMetadata),
    network.name
  );

  const vocdoniVotingRepoAddress = await getContractAddress(
    'vocdoniVoting-repo',
    hre
  );
  const vocdoniVotingRepo = PluginRepo__factory.connect(
    vocdoniVotingRepoAddress,
    ethers.provider
  );
  if (
    await vocdoniVotingRepo.callStatic.isGranted(
      vocdoniVotingRepoAddress,
      deployer.address,
      await vocdoniVotingRepo.MAINTAINER_PERMISSION_ID(),
      '0x00'
    )
  ) {
    console.log(`Deployer has permission to install new vocdoniVoting version`);
    const tx = await vocdoniVotingRepo
      .connect(deployer)
      .createVersion(
        TARGET_RELEASE,
        deployResult.address,
        ethers.utils.toUtf8Bytes(`ipfs://${vocdoniVotingBuildCIDPath}`),
        ethers.utils.toUtf8Bytes(`ipfs://${vocdoniVotingReleaseCIDPath}`)
      );
    console.log(`Creating new vocdoniVoting build version with ${tx.hash}`);
    await tx.wait();
    return;
  }

  const tx = await vocdoniVotingRepo
    .connect(deployer)
    .populateTransaction.createVersion(
      TARGET_RELEASE,
      deployResult.address,
      ethers.utils.toUtf8Bytes(`ipfs://${vocdoniVotingBuildCIDPath}`),
      ethers.utils.toUtf8Bytes(`ipfs://${vocdoniVotingReleaseCIDPath}`)
    );

  if (!tx.to || !tx.data) {
    throw new Error(
      `Failed to populate vocdoniVotingRepo createVersion transaction`
    );
  }

  console.log(
    `Deployer has no permission to create a new version. Adding managingDAO action`
  );
  hre.managingDAOActions.push({
    to: tx.to,
    data: tx.data,
    value: 0,
    description: `Creates a new build for release 1 in the VocdoniVotingRepo (${vocdoniVotingRepoAddress}) with VocdoniVotingSetup (${deployResult.address})`,
  });
};
export default func;
func.tags = ['VocdoniVotingPlugin'].concat(UPDATE_INFOS['v1_3_0'].tags);
