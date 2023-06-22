import {DeployFunction} from 'hardhat-deploy/types';

import buildMetadataJson from '../../../../contracts/build-metadata.json';
import {findEvent} from '../../event';

import {checkPermission, getContractAddress, hashHelpers} from '../../helpers';
import {Operation} from '../../types';
import {
  DAO__factory,
  VocdoniVotingSetup__factory,
  VocdoniVoting__factory,
  PluginSetupProcessor__factory,
} from '../../../../typechain';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {InstallationPreparedEvent} from '../../../../typechain/PluginSetupProcessor';
import {getNamedTypesFromMetadata} from '../../metadata';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {ethers, network} = hre;
  const [deployer] = await ethers.getSigners();

  if (network.name !== 'localhost' && network.name !== 'hardhat') {
    if (
      !('MANAGINGDAO_MULTISIG_LISTEDONLY' in process.env) ||
      !('MANAGINGDAO_MULTISIG_MINAPPROVALS' in process.env) ||
      !('MANAGINGDAO_MULTISIG_APPROVERS' in process.env)
    ) {
      throw new Error('Managing DAO VocdoniVoting settings not set in .env');
    }
  }

  const approvers = process.env.MANAGINGDAO_MULTISIG_APPROVERS?.split(',') || [
    deployer.address,
  ];
  const minApprovals = parseInt(
    process.env.MANAGINGDAO_MULTISIG_MINAPPROVALS || '1'
  );
  // In case `MANAGINGDAO_MULTISIG_LISTEDONLY` not present in .env
  // which applies only hardhat/localhost, use `true` setting for extra safety for tests.
  const listedOnly =
    'MANAGINGDAO_MULTISIG_LISTEDONLY' in process.env
      ? process.env.MANAGINGDAO_MULTISIG_LISTEDONLY === 'true'
      : true;

  // Get `managingDAO` address.
  const managingDAOAddress = await getContractAddress('DAO', hre);

  // Get `DAO` contract.
  const managingDaoContract = DAO__factory.connect(
    managingDAOAddress,
    deployer
  );

  // Get `PluginSetupProcessor` address.
  const pspAddress = await getContractAddress('PluginSetupProcessor', hre);

  // Get `PluginSetupProcessor` contract.
  const pspContract = PluginSetupProcessor__factory.connect(
    pspAddress,
    deployer
  );

  // Install vocdoniVoting build 2
  const vocdoniVotingRepoAddress = hre.aragonPluginRepos['vocdoniVoting'];
  const versionTag = {
    release: 1,
    build: 2,
  };
  const pluginSetupRef = {
    pluginSetupRepo: vocdoniVotingRepoAddress,
    versionTag,
  };

  // Prepare vocdoniVoting plugin for managingDAO
  const data = ethers.utils.defaultAbiCoder.encode(
    getNamedTypesFromMetadata(
      buildMetadataJson.pluginSetup.prepareInstallation.inputs
    ),
    [approvers, [listedOnly, minApprovals]]
  );
  const prepareTx = await pspContract.prepareInstallation(managingDAOAddress, {
    data,
    pluginSetupRef,
  });
  await prepareTx.wait();

  // extract info from prepare event
  const event = await findEvent<InstallationPreparedEvent>(
    prepareTx,
    'InstallationPrepared'
  );
  const installationPreparedEvent = event.args;

  hre.managingDAOVocdoniVotingPluginAddress = installationPreparedEvent.plugin;

  console.log(
    `Prepared (VocdoniVoting: ${installationPreparedEvent.plugin} version (release: ${versionTag.release} / build: ${versionTag.build}) to be applied on (ManagingDAO: ${managingDAOAddress}), see (tx: ${prepareTx.hash})`
  );

  // Adding plugin to verify array
  const vocdoniVotingSetupAddress = await getContractAddress('VocdoniVotingSetup', hre);
  const vocdoniVotingSetup = VocdoniVotingSetup__factory.connect(
    vocdoniVotingSetupAddress,
    deployer
  );
  hre.aragonToVerifyContracts.push({
    address: installationPreparedEvent.plugin,
    args: [
      await vocdoniVotingSetup.implementation(),
      await VocdoniVoting__factory.createInterface().encodeFunctionData(
        'initialize',
        [
          managingDAOAddress,
          approvers,
          {
            onlyListed: listedOnly,
            minApprovals: minApprovals,
          },
        ]
      ),
    ],
  });

  // Apply vocdoniVoting plugin to the managingDAO
  const applyTx = await pspContract.applyInstallation(managingDAOAddress, {
    helpersHash: hashHelpers(
      installationPreparedEvent.preparedSetupData.helpers
    ),
    permissions: installationPreparedEvent.preparedSetupData.permissions,
    plugin: installationPreparedEvent.plugin,
    pluginSetupRef,
  });
  await applyTx.wait();

  await checkPermission(managingDaoContract, {
    operation: Operation.Grant,
    where: {name: 'ManagingDAO', address: managingDAOAddress},
    who: {name: 'VocdoniVoting plugin', address: installationPreparedEvent.plugin},
    permission: 'EXECUTE_PERMISSION',
  });

  console.log(
    `Applied (VocdoniVoting: ${installationPreparedEvent.plugin}) on (ManagingDAO: ${managingDAOAddress}), see (tx: ${applyTx.hash})`
  );
};
export default func;
func.tags = ['New', 'InstallVocdoniVotingOnManagingDAO'];
