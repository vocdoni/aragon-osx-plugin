import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

import vocdoniVotingReleaseMetadata from '../../../../contracts/release-metadata.json';
import vocdoniVotingBuildMetadata from '../../../../contracts/build-metadata.json';

import {
  createPluginRepo,
  populatePluginRepo,
  getContractAddress,
  uploadToIPFS,
} from '../../helpers';
import {ethers} from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log(`\nCreating vocdoniVoting repo.`);

  console.warn(
    'Please make sure pluginRepo is not created more than once with the same name.'
  );

  const {network} = hre;

  const vocdoniVotingReleaseCIDPath = await uploadToIPFS(
    JSON.stringify(vocdoniVotingReleaseMetadata),
    network.name
  );
  const vocdoniVotingBuildCIDPath = await uploadToIPFS(
    JSON.stringify(vocdoniVotingBuildMetadata),
    network.name
  );

  const vocdoniVotingSetupContract = await getContractAddress(
    'MultisigSetup',
    hre
  );

  await createPluginRepo(hre, 'vocdoniVoting');
  await populatePluginRepo(hre, 'vocdoniVoting', [
    {
      versionTag: [1, 2],
      pluginSetupContract: vocdoniVotingSetupContract,
      releaseMetadata: ethers.utils.hexlify(
        ethers.utils.toUtf8Bytes(`ipfs://${vocdoniVotingReleaseCIDPath}`)
      ),
      buildMetadata: ethers.utils.hexlify(
        ethers.utils.toUtf8Bytes(`ipfs://${vocdoniVotingBuildCIDPath}`)
      ),
    },
  ]);
};

export default func;
func.tags = ['New', 'CreateMultisigRepo'];
