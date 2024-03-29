import {expect} from 'chai';
import {ethers} from 'hardhat';
import {Contract, BigNumber} from 'ethers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';

import {
  Addresslist__factory,
  DAO,
  IERC165Upgradeable__factory,
  IPlugin__factory,
  IVocdoniProposal__factory,
  VocdoniVoting,
  VocdoniVoting__factory,
  GovernanceERC20Mock,
  GovernanceERC20Mock__factory,
  IExecutionMultisig__factory,
  ERC20BasicMock,
  ERC20BasicMock__factory,
} from '../typechain';

import {VOCDONI_EVENTS} from './utils/event';
import {deployNewDAO} from './utils/dao';
import {
  timestampIn,
  setTimeForNextBlock,
  VocdoniProposalParams,
  VocdoniVotingSettings,
} from './utils/voting';
import {deployWithProxy} from './utils/dao';
import {getInterfaceID, OZ_ERRORS} from './utils/helpers';

export const vocdoniVotingInterface = new ethers.utils.Interface([
  'function setTally(uint256 _proposalId, uint256[][] memory _tally)',
  'function approveTally(uint256 _proposalId, bool _tryExecution)',
  'function executeProposal(uint256 _proposalId)',
]);

export async function approveWithSigners(
  vocdoniVoting: Contract,
  proposalId: number,
  signers: SignerWithAddress[],
  signerIds: number[]
) {
  let promises = signerIds.map(i =>
    vocdoniVoting.connect(signers[i]).approveTally(proposalId)
  );

  await Promise.all(promises);
}

export const ANY_ADDR = '0xffffffffffffffffffffffffffffffffffffffff';

describe('Vocdoni Plugin', function () {
  let signers: SignerWithAddress[];
  let vocdoniVoting: VocdoniVoting;
  let dao: DAO;
  let dummyMetadata: string;
  let dummyActions: any;
  let vocdoniVotingSettings: VocdoniVotingSettings;
  let vocdoniProposalParams: VocdoniProposalParams;
  let governanceErc20Mock: GovernanceERC20Mock;
  let GovernanceERC20Mock: GovernanceERC20Mock__factory;
  let basicErc20Mock: ERC20BasicMock;
  let BasicErc20Mock: ERC20BasicMock__factory;

  const id = 0;

  async function setBalances(
    balances: {receiver: string; amount: number | BigNumber}[]
  ) {
    const promises = balances.map(balance =>
      governanceErc20Mock.setBalance(balance.receiver, balance.amount)
    );
    await Promise.all(promises);
  }

  async function setBalancesBasicERC20(
    balances: {receiver: string; amount: number | BigNumber}[]
  ) {
    const promises = balances.map(balance =>
      basicErc20Mock.mint(balance.receiver, balance.amount)
    );
    await Promise.all(promises);
  }

  async function setTotalSupply(totalSupply: number) {
    await ethers.provider.send('evm_mine', []);
    let block = await ethers.provider.getBlock('latest');

    const currentTotalSupply: BigNumber =
      await governanceErc20Mock.getPastTotalSupply(block.number - 1);

    await governanceErc20Mock.setBalance(
      `0x${'0'.repeat(39)}1`, // address(1)
      BigNumber.from(totalSupply).sub(currentTotalSupply)
    );
  }

  before(async () => {
    signers = await ethers.getSigners();
    dummyActions = [
      {
        to: signers[0].address,
        data: '0x00000000',
        value: 0,
      },
    ];
    dummyMetadata = ethers.utils.hexlify(
      ethers.utils.toUtf8Bytes('0x123456789')
    );

    dao = await deployNewDAO(signers[0]);
  });

  beforeEach(async function () {
    GovernanceERC20Mock = new GovernanceERC20Mock__factory(signers[0]);
    governanceErc20Mock = await GovernanceERC20Mock.deploy(
      dao.address,
      'GOV',
      'GOV',
      {
        receivers: [],
        amounts: [],
      }
    );

    BasicErc20Mock = new ERC20BasicMock__factory(signers[0]);
    basicErc20Mock = await BasicErc20Mock.deploy('BASIC', 'BASIC');

    vocdoniVotingSettings = {
      onlyExecutionMultisigProposalCreation: true,
      minTallyApprovals: 2,
      minParticipation: 0,
      supportThreshold: 0,
      minVoteDuration: 3600,
      minTallyDuration: 3600,
      daoTokenAddress: governanceErc20Mock.address,
      minProposerVotingPower: BigNumber.from(0),
      censusStrategyURI: 'ipfs://Qm...',
    };

    vocdoniProposalParams = {
      securityBlock: await ethers.provider.getBlockNumber(),
      startDate: 0,
      voteEndDate: 0,
      tallyEndDate: 0,
      totalVotingPower: BigNumber.from(1),
      censusURI: 'ipfs://Qm...',
      censusRoot:
        '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };

    const VocdoniVotingFactory = new VocdoniVoting__factory(signers[0]);
    vocdoniVoting = await deployWithProxy(VocdoniVotingFactory);
    // grant execute permissions to the plugin
    dao.grant(
      dao.address,
      vocdoniVoting.address,
      ethers.utils.id('EXECUTE_PERMISSION')
    );
    // grant executionMultisig permissions to signers[0]
    dao.grant(
      vocdoniVoting.address,
      signers[0].address,
      ethers.utils.id('UPDATE_PLUGIN_SETTINGS_PERMISSION')
    );
    dao.grant(
      vocdoniVoting.address,
      signers[0].address,
      ethers.utils.id('UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION')
    );
    // grant executionMultisig permissions to signers[1]
    dao.grant(
      vocdoniVoting.address,
      signers[1].address,
      ethers.utils.id('UPDATE_PLUGIN_SETTINGS_PERMISSION')
    );
    dao.grant(
      vocdoniVoting.address,
      signers[1].address,
      ethers.utils.id('UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION')
    );
  });

  describe('initialize:', async () => {
    it('reverts if trying to re-initialize', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );

      await expect(
        vocdoniVoting.initialize(
          dao.address,
          signers.slice(0, 5).map(s => s.address),
          vocdoniVotingSettings
        )
      ).to.be.revertedWith(OZ_ERRORS.ALREADY_INITIALIZED);
    });

    it('adds the initial addresses to the address list', async () => {
      expect(await vocdoniVoting.addresslistLength()).to.equal(0);

      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 2).map(s => s.address),
        vocdoniVotingSettings
      );

      expect(await vocdoniVoting.addresslistLength()).to.equal(2);
      expect(await vocdoniVoting.isListed(signers[0].address)).to.equal(true);
      expect(await vocdoniVoting.isListed(signers[1].address)).to.equal(true);
    });

    it('should revert if the members list is empty', async () => {
      await expect(
        vocdoniVoting.initialize(dao.address, [], vocdoniVotingSettings)
      ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidListLength');
    });

    it('should revert if members list is longer than uint16 max', async () => {
      const megaMember = signers[1];
      const members: string[] = new Array(65537).fill(megaMember.address);
      await expect(
        vocdoniVoting.initialize(dao.address, members, vocdoniVotingSettings)
      )
        .to.revertedWithCustomError(
          vocdoniVoting,
          'AddresslistLengthOutOfBounds'
        )
        .withArgs(65535, members.length);
    });

    // lastExecutionMultisigChange is updated to the current block number
    it('should set the `lastExecutionMultisigChange` to the current block number', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      const blockNumber = await ethers.provider.getBlockNumber();
      expect(
        (await vocdoniVoting.getLastExecutionMultisigChange()).toNumber()
      ).to.be.eq(blockNumber);
    });

    // lastPluginSettingsChange is updated to the current block number
    it('should set the `lastPluginSettingsChange` to the current block number', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      const blockNumber = await ethers.provider.getBlockNumber();
      expect(
        (await vocdoniVoting.getLastPluginSettingsChange()).toNumber()
      ).to.be.eq(blockNumber);
    });

    it('should set the `minTallyApprovals`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect(
        (await vocdoniVoting.getPluginSettings()).minTallyApprovals
      ).to.be.eq(vocdoniVotingSettings.minTallyApprovals);
    });

    it('should set `minVoteDuration`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect(
        (await vocdoniVoting.getPluginSettings()).minVoteDuration
      ).to.be.eq(vocdoniVotingSettings.minVoteDuration);
    });

    it('should set `minTallyDuration`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect(
        (await vocdoniVoting.getPluginSettings()).minTallyDuration
      ).to.be.eq(vocdoniVotingSettings.minTallyDuration);
    });

    it('should set `daoTokenAddress`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect(
        (await vocdoniVoting.getPluginSettings()).daoTokenAddress
      ).to.be.eq(vocdoniVotingSettings.daoTokenAddress);
    });

    it('should set `censusStrategyURI`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect(
        (await vocdoniVoting.getPluginSettings()).censusStrategyURI
      ).to.be.eq(vocdoniVotingSettings.censusStrategyURI);
    });

    it('should set `minProposerVotingPower`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect(
        (await vocdoniVoting.getPluginSettings()).minProposerVotingPower
      ).to.be.eq(vocdoniVotingSettings.minProposerVotingPower);
    });

    it('should set `minParticipation`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect(
        (await vocdoniVoting.getPluginSettings()).minParticipation
      ).to.be.eq(vocdoniVotingSettings.minParticipation);
    });

    it('should set `supportThreshold`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect(
        (await vocdoniVoting.getPluginSettings()).supportThreshold
      ).to.be.eq(vocdoniVotingSettings.supportThreshold);
    });

    it('should emit `PluginSettingsUpdated` during initialization', async () => {
      await expect(
        vocdoniVoting.initialize(
          dao.address,
          signers.slice(0, 5).map(s => s.address),
          vocdoniVotingSettings
        )
      )
        .to.emit(vocdoniVoting, VOCDONI_EVENTS.PLUGIN_SETTINGS_UPDATED)
        .withArgs(
          vocdoniVotingSettings.onlyExecutionMultisigProposalCreation,
          vocdoniVotingSettings.minTallyApprovals,
          vocdoniVotingSettings.minParticipation,
          vocdoniVotingSettings.supportThreshold,
          vocdoniVotingSettings.minVoteDuration,
          vocdoniVotingSettings.minTallyDuration,
          vocdoniVotingSettings.daoTokenAddress,
          vocdoniVotingSettings.censusStrategyURI,
          vocdoniVotingSettings.minProposerVotingPower
        );
    });

    it('should emit `ExecutionMultisigMembersAdded` during initialization', async () => {
      const members = signers.slice(0, 5).map(s => s.address);

      await expect(
        vocdoniVoting.initialize(dao.address, members, vocdoniVotingSettings)
      ).to.emit(vocdoniVoting, VOCDONI_EVENTS.EXECUTION_MULTISIG_MEMBERS_ADDED);
      // returns a hash of the members array
    });
  });

  describe('plugin interface: ', async () => {
    it('does not support the empty interface', async () => {
      expect(await vocdoniVoting.supportsInterface('0xffffffff')).to.be.false;
    });

    it('supports the `IERC165Upgradeable` interface', async () => {
      const iface = IERC165Upgradeable__factory.createInterface();
      expect(await vocdoniVoting.supportsInterface(getInterfaceID(iface))).to.be
        .true;
    });

    it('supports the `IPlugin` interface', async () => {
      const iface = IPlugin__factory.createInterface();
      expect(await vocdoniVoting.supportsInterface(getInterfaceID(iface))).to.be
        .true;
    });

    it('supports the `IVocdoniProposal` interface', async () => {
      const iface = IVocdoniProposal__factory.createInterface();
      expect(await vocdoniVoting.supportsInterface(getInterfaceID(iface))).to.be
        .true;
    });

    it('supports the `Addresslist` interface', async () => {
      const iface = Addresslist__factory.createInterface();
      expect(await vocdoniVoting.supportsInterface(getInterfaceID(iface))).to.be
        .true;
    });

    it('supports the `IExecutionMultisig` interface', async () => {
      const iface = IExecutionMultisig__factory.createInterface();
      expect(await vocdoniVoting.supportsInterface(getInterfaceID(iface))).to.be
        .true;
    });
  });

  describe('updatePluginSettings:', async () => {
    beforeEach(async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
    });
    it('should emit `PluginSettingsUpdated` when `updatePluginSettings` gets called', async () => {
      await expect(vocdoniVoting.updatePluginSettings(vocdoniVotingSettings))
        .to.emit(vocdoniVoting, VOCDONI_EVENTS.PLUGIN_SETTINGS_UPDATED)
        .withArgs(
          vocdoniVotingSettings.onlyExecutionMultisigProposalCreation,
          vocdoniVotingSettings.minTallyApprovals,
          vocdoniVotingSettings.minParticipation,
          vocdoniVotingSettings.supportThreshold,
          vocdoniVotingSettings.minVoteDuration,
          vocdoniVotingSettings.minTallyDuration,
          vocdoniVotingSettings.daoTokenAddress,
          vocdoniVotingSettings.censusStrategyURI,
          vocdoniVotingSettings.minProposerVotingPower
        );
    });
    it('should update the `minTallyApprovals`', async () => {
      vocdoniVotingSettings.minTallyApprovals = 3;
      await vocdoniVoting.updatePluginSettings(vocdoniVotingSettings);
      expect(
        (await vocdoniVoting.getPluginSettings()).minTallyApprovals
      ).to.be.eq(vocdoniVotingSettings.minTallyApprovals);
    });
    it('should update `minVoteDuration`', async () => {
      vocdoniVotingSettings.minVoteDuration = 20000;
      await vocdoniVoting.updatePluginSettings(vocdoniVotingSettings);
      expect(
        (await vocdoniVoting.getPluginSettings()).minVoteDuration
      ).to.be.eq(vocdoniVotingSettings.minVoteDuration);
    });
    it('should update `minTallyDuration`', async () => {
      vocdoniVotingSettings.minTallyDuration = 20000;
      await vocdoniVoting.updatePluginSettings(vocdoniVotingSettings);
      expect(
        (await vocdoniVoting.getPluginSettings()).minTallyDuration
      ).to.be.eq(vocdoniVotingSettings.minTallyDuration);
    });
    it('should update `minParticipation`', async () => {
      vocdoniVotingSettings.minParticipation = 1;
      await vocdoniVoting.updatePluginSettings(vocdoniVotingSettings);
      expect(
        (await vocdoniVoting.getPluginSettings()).minParticipation
      ).to.be.eq(vocdoniVotingSettings.minParticipation);
    });
    it('should update `supportThreshold`', async () => {
      vocdoniVotingSettings.supportThreshold = 1;
      await vocdoniVoting.updatePluginSettings(vocdoniVotingSettings);
      expect(
        (await vocdoniVoting.getPluginSettings()).supportThreshold
      ).to.be.eq(vocdoniVotingSettings.supportThreshold);
    });
    it('should update `daoTokenAddress`', async () => {
      vocdoniVotingSettings.daoTokenAddress = signers[1].address;
      await vocdoniVoting.updatePluginSettings(vocdoniVotingSettings);
      expect(
        (await vocdoniVoting.getPluginSettings()).daoTokenAddress
      ).to.be.eq(vocdoniVotingSettings.daoTokenAddress);
    });
    it('should update `censusStrategyURI`', async () => {
      vocdoniVotingSettings.censusStrategyURI = '0x123456789';
      await vocdoniVoting.updatePluginSettings(vocdoniVotingSettings);
      expect(
        (await vocdoniVoting.getPluginSettings()).censusStrategyURI
      ).to.be.eq(vocdoniVotingSettings.censusStrategyURI);
    });
    it('should update `minProposerVotingPower`', async () => {
      vocdoniVotingSettings.minProposerVotingPower = BigNumber.from(1);
      await vocdoniVoting.updatePluginSettings(vocdoniVotingSettings);
      expect(
        (await vocdoniVoting.getPluginSettings()).minProposerVotingPower
      ).to.be.eq(vocdoniVotingSettings.minProposerVotingPower);
    });
    it('should revert with RatioOutOfBounds if supportThreshold is greater than 10^6', async () => {
      vocdoniVotingSettings.supportThreshold = 1000001;
      await expect(
        vocdoniVoting.updatePluginSettings(vocdoniVotingSettings)
      ).to.be.revertedWithCustomError(vocdoniVoting, 'RatioOutOfBounds');
    });
    it('should revert with RatioOutOfBounds if minParticipation is greater than 10^6', async () => {
      vocdoniVotingSettings.minParticipation = 1000001;
      await expect(
        vocdoniVoting.updatePluginSettings(vocdoniVotingSettings)
      ).to.be.revertedWithCustomError(vocdoniVoting, 'RatioOutOfBounds');
    });
    it('should revert with VoteDurationOutOfBounds if minVoteDuration is greater than 365 days', async () => {
      vocdoniVotingSettings.minVoteDuration = 31536001;
      await expect(
        vocdoniVoting.updatePluginSettings(vocdoniVotingSettings)
      ).to.be.revertedWithCustomError(vocdoniVoting, 'VoteDurationOutOfBounds');
    });
    it('should revert with TallyDurationOutOfBounds if MinTallyDuration is greater than 365 days', async () => {
      vocdoniVotingSettings.minTallyDuration = 31536001;
      await expect(
        vocdoniVoting.updatePluginSettings(vocdoniVotingSettings)
      ).to.be.revertedWithCustomError(
        vocdoniVoting,
        'TallyDurationOutOfBounds'
      );
    });
    it('should revert with VoteDurationOutOfBounds if minVoteDuration is less than 1 hour', async () => {
      vocdoniVotingSettings.minVoteDuration = 0;
      await expect(
        vocdoniVoting.updatePluginSettings(vocdoniVotingSettings)
      ).to.be.revertedWithCustomError(vocdoniVoting, 'VoteDurationOutOfBounds');
    });
    it('should revert with TallyDurationOutOfBounds if MinTallyDuration is less than 1 hour', async () => {
      vocdoniVotingSettings.minTallyDuration = 3599;
      await expect(
        vocdoniVoting.updatePluginSettings(vocdoniVotingSettings)
      ).to.be.revertedWithCustomError(
        vocdoniVoting,
        'TallyDurationOutOfBounds'
      );
    });
    it('should revert with PluginSettingsUpdatedTooRecently if settings changed in the same block', async () => {
      await ethers.provider.send('evm_setAutomine', [false]);
      await vocdoniVoting
        .connect(signers[0])
        .updatePluginSettings(vocdoniVotingSettings);
      await expect(
        vocdoniVoting
          .connect(signers[0])
          .updatePluginSettings(vocdoniVotingSettings)
      ).to.be.revertedWithCustomError(
        vocdoniVoting,
        'PluginSettingsUpdatedTooRecently'
      );
      await ethers.provider.send('evm_setAutomine', [true]);
    });
    // should set lastPluginSettingsChange to the current block number
    it('should set `lastPluginSettingsChange` to the current block number', async () => {
      await vocdoniVoting.updatePluginSettings(vocdoniVotingSettings);
      let blockNumber = await ethers.provider.getBlockNumber();
      expect(
        (await vocdoniVoting.getLastPluginSettingsChange()).toNumber()
      ).to.be.eq(blockNumber);
    });
  });

  describe('isListed:', async () => {
    it('should return false, if a user is not listed', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address],
        vocdoniVotingSettings
      );

      expect(await vocdoniVoting.isListed(signers[9].address)).to.equal(false);
    });
  });

  describe('isExecutionMultisigMember', async () => {
    it('should return false, if user is not listed', async () => {
      expect(await vocdoniVoting.isExecutionMultisigMember(signers[0].address))
        .to.be.false;
    });

    it('should return true if user is in the latest list', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address],
        vocdoniVotingSettings
      );
      expect(await vocdoniVoting.isExecutionMultisigMember(signers[0].address))
        .to.be.true;
    });
  });

  describe('addExecutionMultisigMembers:', async () => {
    it('should add new members to the executionMultisig address list and emit the `ExecutionMultisigMembersAdded` event', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address],
        vocdoniVotingSettings
      );

      expect(await vocdoniVoting.isListed(signers[0].address)).to.equal(true);
      expect(await vocdoniVoting.isListed(signers[1].address)).to.equal(false);

      // add a new member
      await expect(
        vocdoniVoting.addExecutionMultisigMembers([signers[1].address])
      ).to.emit(vocdoniVoting, VOCDONI_EVENTS.EXECUTION_MULTISIG_MEMBERS_ADDED);
      //.withArgs({newMembers: [signers[1].address]});

      expect(await vocdoniVoting.isListed(signers[0].address)).to.equal(true);
      expect(await vocdoniVoting.isListed(signers[1].address)).to.equal(true);
    });
  });

  describe('removeExecutionMultisigMembers:', async () => {
    it('should remove users from the executionMultisig address list and emit the `ExecutionMultisigMembersRemoved` event', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 2).map(s => s.address),
        vocdoniVotingSettings
      );

      expect(await vocdoniVoting.isListed(signers[0].address)).to.equal(true);
      expect(await vocdoniVoting.isListed(signers[1].address)).to.equal(true);

      // remove an existing member
      await expect(
        vocdoniVoting.removeExecutionMultisigMembers([signers[1].address])
      ).to.emit(
        vocdoniVoting,
        VOCDONI_EVENTS.EXECUTION_MULTISIG_MEMBERS_REMOVED
      );
      //.withArgs([signers[1].address]);

      expect(await vocdoniVoting.isListed(signers[0].address)).to.equal(true);
      expect(await vocdoniVoting.isListed(signers[1].address)).to.equal(false);
    });

    it('reverts if the address list would become empty', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address],
        vocdoniVotingSettings
      );

      await expect(
        vocdoniVoting.removeExecutionMultisigMembers([signers[0].address])
      )
        .to.be.revertedWithCustomError(vocdoniVoting, 'MinApprovalsOutOfBounds')
        .withArgs(
          (await vocdoniVoting.addresslistLength()).sub(1),
          vocdoniVotingSettings.minTallyApprovals
        );
    });

    it('reverts if the address list would become shorter than the current minimum approval parameter requires', async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 3).map(s => s.address),
        vocdoniVotingSettings
      );

      await expect(
        vocdoniVoting.removeExecutionMultisigMembers([signers[1].address])
      ).not.to.be.reverted;

      await expect(
        vocdoniVoting.removeExecutionMultisigMembers([signers[2].address])
      )
        .to.be.revertedWithCustomError(vocdoniVoting, 'MinApprovalsOutOfBounds')
        .withArgs(
          (await vocdoniVoting.addresslistLength()).sub(1),
          vocdoniVotingSettings.minTallyApprovals
        );
    });
  });

  describe('createProposal:', async () => {
    beforeEach(async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
    });

    it('increments the proposal counter', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address], // signers[0] is listed
        vocdoniVotingSettings
      );

      expect(await vocdoniVoting.proposalCount()).to.equal(0);

      await expect(
        vocdoniVoting.createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        )
      ).not.to.be.reverted;

      expect(await vocdoniVoting.proposalCount()).to.equal(1);
    });

    it('creates unique proposal IDs for each proposal', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await ethers.provider.send('evm_mine', []);
      const proposalId0 = await vocdoniVoting.callStatic.createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions
      );
      // create a new proposal for the proposalCounter to be incremented
      await expect(
        vocdoniVoting.createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        )
      ).not.to.be.reverted;

      const proposalId1 = await vocdoniVoting.callStatic.createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions
      );

      expect(proposalId0).to.equal(0); // To be removed when proposal ID is generated as a hash.
      expect(proposalId1).to.equal(1); // To be removed when proposal ID is generated as a hash.

      expect(proposalId0).to.not.equal(proposalId1);
    });

    it('emits the `ProposalCreated` event', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );

      const allowFailureMap = 1;

      await expect(
        vocdoniVoting
          .connect(signers[0])
          .createProposal(
            ethers.utils.randomBytes(32),
            0,
            vocdoniProposalParams,
            dummyActions
          )
      ).to.emit(vocdoniVoting, VOCDONI_EVENTS.PROPOSAL_CREATED);
    });

    it('reverts if the vocdoniVoting settings have been changed in the same block', async () => {
      vocdoniVotingSettings.minVoteDuration = 3601;
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );

      const vochainProposalId = ethers.utils.randomBytes(32);
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(vochainProposalId, 0, vocdoniProposalParams, [
          {
            to: vocdoniVoting.address,
            value: 0,
            data: vocdoniVoting.interface.encodeFunctionData(
              'updatePluginSettings',
              [
                {
                  minTallyApprovals: 2,
                  minVoteDuration: 3601,
                  minParticipation: 0,
                  minTallyDuration: 10000,
                  supportThreshold: 0,
                  daoTokenAddress: ethers.constants.AddressZero,
                  censusStrategyURI: 0,
                  minProposerVotingPower: 0,
                },
              ]
            ),
          },
        ]);

      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );

      await vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]); // tally already approved by signers[0]

      await ethers.provider.send('evm_setAutomine', [false]);

      await vocdoniVoting.connect(signers[1]).approveTally(0, true);

      await expect(
        vocdoniVoting
          .connect(signers[0])
          .createProposal(
            ethers.utils.randomBytes(32),
            0,
            vocdoniProposalParams,
            dummyActions
          )
      ).to.be.revertedWithCustomError(
        vocdoniVoting,
        'PluginSettingsUpdatedTooRecently'
      );
      await ethers.provider.send('evm_setAutomine', [true]);
    });

    // check that the user creating a proposal have enough voting power
    it('reverts if the user does not have enough voting power', async () => {
      vocdoniVotingSettings.minProposerVotingPower = BigNumber.from(1);
      vocdoniVotingSettings.onlyExecutionMultisigProposalCreation = false;
      await setBalances([{receiver: signers[0].address, amount: 10}]);
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );

      // signers[0] delegates 5 tokens to signers[1]
      await governanceErc20Mock
        .connect(signers[0])
        .delegate(signers[1].address);

      await expect(
        vocdoniVoting
          .connect(signers[2])
          .createProposal(
            ethers.utils.randomBytes(32),
            0,
            vocdoniProposalParams,
            dummyActions
          )
      ).to.be.revertedWithCustomError(vocdoniVoting, 'NotEnoughVotingPower');

      // check that signers[0] can create a proposal
      await expect(
        vocdoniVoting
          .connect(signers[0])
          .createProposal(
            ethers.utils.randomBytes(32),
            0,
            vocdoniProposalParams,
            dummyActions
          )
      ).not.to.be.reverted;

      // check that signers[1] can create a proposal
      await expect(
        vocdoniVoting
          .connect(signers[1])
          .createProposal(
            ethers.utils.randomBytes(32),
            0,
            vocdoniProposalParams,
            dummyActions
          )
      ).not.to.be.reverted;
    });

    // check if token is basic ERC20 _tryGetVotes() pass
    it('should not fail when calling _tryGetVotes() for any ERC20', async () => {
      vocdoniVotingSettings.minProposerVotingPower = BigNumber.from(1);
      vocdoniVotingSettings.onlyExecutionMultisigProposalCreation = false;
      vocdoniVotingSettings.daoTokenAddress = basicErc20Mock.address;
      await setBalancesBasicERC20([{receiver: signers[0].address, amount: 10}]);
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );

      // check that signers[0] can create a proposal
      await expect(
        vocdoniVoting
          .connect(signers[0])
          .createProposal(
            ethers.utils.randomBytes(32),
            0,
            vocdoniProposalParams,
            dummyActions
          )
      ).not.to.be.reverted;
    });

    context('onlyCommitteProposalCreation', async () => {
      it('creates a proposal when unlisted accounts are allowed', async () => {
        vocdoniVotingSettings.onlyExecutionMultisigProposalCreation = false;
        await vocdoniVoting.initialize(
          dao.address,
          [signers[0].address], // signers[0] is listed
          vocdoniVotingSettings
        );

        await expect(
          vocdoniVoting
            .connect(signers[2]) // not listed
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.emit(vocdoniVoting, VOCDONI_EVENTS.PROPOSAL_CREATED);
      });

      it('creates a proposal when unlisted accounts are allowed and have tokens', async () => {
        vocdoniVotingSettings.onlyExecutionMultisigProposalCreation = false;
        vocdoniVotingSettings.minProposerVotingPower = BigNumber.from(1);
        await setBalances([{receiver: signers[2].address, amount: 1}]);

        await vocdoniVoting.initialize(
          dao.address,
          [signers[0].address], // signers[0] is listed
          vocdoniVotingSettings
        );
        await expect(
          vocdoniVoting
            .connect(signers[2]) // not listed
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.emit(vocdoniVoting, VOCDONI_EVENTS.PROPOSAL_CREATED);

        await expect(
          vocdoniVoting
            .connect(signers[3]) // not listed
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.revertedWithCustomError(vocdoniVoting, 'NotEnoughVotingPower');
      });

      it('does not create a proposal when address is not authorized', async () => {
        await vocdoniVoting.initialize(
          dao.address,
          [signers[0].address], // signers[0] is listed
          vocdoniVotingSettings
        );
        await expect(
          vocdoniVoting
            .connect(signers[1]) // not listed
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.revertedWithCustomError(vocdoniVoting, 'OnlyExecutionMultisig');
      });
    });

    context('process dates:', async () => {
      it('reverts if invalid start date', async () => {
        let currentBlock = await ethers.provider.getBlock('latest');
        vocdoniProposalParams.startDate = currentBlock.timestamp - 1000;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidStartDate');

        vocdoniProposalParams.startDate = currentBlock.timestamp + 10;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.not.be.reverted;

        vocdoniProposalParams.startDate = 0;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.not.be.reverted;
      });

      it('reverts if invalid end date', async () => {
        let currentBlock = await ethers.provider.getBlock('latest');
        vocdoniProposalParams.voteEndDate = currentBlock.timestamp;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidVoteEndDate');

        vocdoniProposalParams.voteEndDate = currentBlock.timestamp - 1;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidVoteEndDate');

        vocdoniProposalParams.voteEndDate = 0;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.not.be.reverted;
      });

      it('reverts if invalid expiration date', async () => {
        let currentBlock = await ethers.provider.getBlock('latest');
        vocdoniProposalParams.tallyEndDate = 10;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTallyEndDate');
      });
    });
  });

  describe('setTally:', async () => {
    beforeEach(async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
    });

    it('reverts if not a executionMultisig member', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address], // signers[0] is listed
        vocdoniVotingSettings
      );

      await expect(
        vocdoniVoting.createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        )
      ).not.to.be.reverted;

      await expect(vocdoniVoting.connect(signers[1]).setTally(0, [[10, 0, 0]]))
        .to.be.revertedWithCustomError(vocdoniVoting, 'OnlyExecutionMultisig')
        .withArgs(signers[1].address);
    });

    it('reverts if plugin settings changed in the same block', async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      // create process 0
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );

      // change plugin settings
      const vochainProposalId = ethers.utils.randomBytes(32);
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(vochainProposalId, 0, vocdoniProposalParams, [
          {
            to: vocdoniVoting.address,
            value: 0,
            data: vocdoniVoting.interface.encodeFunctionData(
              'updatePluginSettings',
              [
                {
                  minTallyApprovals: 2,
                  minVoteDuration: 3601,
                  minTallyDuration: 10000,
                  minParticipation: 0,
                  supportThreshold: 0,
                  daoTokenAddress: ethers.constants.AddressZero,
                  censusStrategyURI: 'TKN',
                  minProposerVotingPower: 1,
                },
              ]
            ),
          },
        ]);

      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await vocdoniVoting.connect(signers[0]).setTally(1, [[10, 0, 0]]); // tally already approved by signers[0]

      // set automine to false
      await ethers.provider.send('evm_setAutomine', [false]);

      await vocdoniVoting.connect(signers[1]).approveTally(1, true);

      // should revert if trying to set tally on process 0
      await expect(
        vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]])
      ).to.revertedWithCustomError(
        vocdoniVoting,
        'PluginSettingsUpdatedTooRecently'
      );

      // set automine to true
      await ethers.provider.send('evm_setAutomine', [true]);
    });

    it('reverts if process not in tally phase', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      await expect(
        vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]])
      ).to.revertedWithCustomError(vocdoniVoting, 'ProposalNotInTallyPhase');
    });

    it('reverts if invalid tally', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(
        vocdoniVoting.connect(signers[0]).setTally(0, [
          [10, 0, 0],
          [0, 20, 2],
        ])
      ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally');

      await expect(
        vocdoniVoting.connect(signers[0]).setTally(0, [[0, 0, 0, 20]])
      ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally');
    });

    it('reverts if trying to set same tally twice', async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.reverted;

      await expect(
        vocdoniVoting.connect(signers[1]).setTally(0, [[10, 0, 0]])
      ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally');
    });

    it('reverts if trying to set the tally and already approved', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );

      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.reverted;

      await expect(
        vocdoniVoting.connect(signers[1]).setTally(0, [[10, 0, 0]])
      ).to.be.revertedWithCustomError(vocdoniVoting, 'TallyAlreadyApproved');
    });

    it('resets the approval counter if tally is already set but changed by another executionMultisig member', async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );

      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.reverted;

      let proposal = await vocdoniVoting.connect(signers[0]).getProposal(0);
      expect(proposal.approvers.length).to.be.equal(1);

      await expect(vocdoniVoting.connect(signers[1]).setTally(0, [[0, 10, 0]]))
        .to.not.reverted;

      proposal = await vocdoniVoting.connect(signers[0]).getProposal(0);
      expect(proposal.approvers.length).to.be.equal(1);
      expect(proposal.approvers[0]).to.be.equal(signers[1].address);
    });

    it('sets the tally correctly and modifies the approvers count', async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );

      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.reverted;

      await expect(vocdoniVoting.connect(signers[1]).approveTally(0, false)).to
        .not.reverted;

      let proposal = await vocdoniVoting.connect(signers[0]).getProposal(0);
      expect(proposal.approvers.length).to.be.equal(2);
      expect(proposal.tally[0][0]).to.be.equal(10);
      expect(proposal.tally[0][1]).to.be.equal(0);
      expect(proposal.tally[0][2]).to.be.equal(0);
    });

    it('emits two events when the tally is set. TallySet and TallyApproved', async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );

      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      let setTallyTx = await vocdoniVoting
        .connect(signers[0])
        .setTally(0, [[10, 0, 0]]);
      expect(setTallyTx).to.emit(vocdoniVoting, VOCDONI_EVENTS.TALLY_SET);
      expect(setTallyTx).to.emit(vocdoniVoting, VOCDONI_EVENTS.TALLY_APPROVAL);
    });
  });

  describe('approveTally:', async () => {
    beforeEach(async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
    });

    it('reverts if not a executionMultisig member', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.reverted;
      await expect(vocdoniVoting.connect(signers[1]).approveTally(0, false))
        .to.be.revertedWithCustomError(vocdoniVoting, 'OnlyExecutionMultisig')
        .withArgs(signers[1].address);
    });

    it('reverts if tally is not set', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(
        vocdoniVoting.connect(signers[0]).approveTally(0, false)
      ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally');
    });

    it('executionMultisig member can approve the tally only once if not changed', async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.reverted;
      await expect(
        vocdoniVoting.connect(signers[0]).approveTally(0, false)
      ).to.be.revertedWithCustomError(
        vocdoniVoting,
        'TallyAlreadyApprovedBySender'
      );
      // approve with signer[1]
      await expect(vocdoniVoting.connect(signers[1]).approveTally(0, false)).to
        .not.reverted;

      let proposal = await vocdoniVoting.connect(signers[0]).getProposal(0);
      expect(proposal.approvers.length).to.be.equal(2);
    });

    it('executionMultisig member can approve the tally only once if changed', async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      vocdoniProposalParams.tallyEndDate = await timestampIn(10000);
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.reverted;

      let proposal = await vocdoniVoting.connect(signers[0]).getProposal(0);
      expect(proposal.approvers.length).to.be.equal(1);
      expect(proposal.approvers[0]).to.be.equal(signers[0].address);

      await expect(vocdoniVoting.connect(signers[1]).setTally(0, [[9, 0, 0]]))
        .to.not.reverted;

      proposal = await vocdoniVoting.connect(signers[0]).getProposal(0);
      expect(proposal.approvers.length).to.be.equal(1);
      expect(proposal.approvers[0]).to.be.equal(signers[1].address);

      await expect(
        vocdoniVoting.connect(signers[1]).approveTally(0, false)
      ).to.be.revertedWithCustomError(
        vocdoniVoting,
        'TallyAlreadyApprovedBySender'
      );
    });

    it('emits an event when the tally is approved', async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.reverted;

      await expect(
        vocdoniVoting.connect(signers[1]).approveTally(0, false)
      ).to.emit(vocdoniVoting, VOCDONI_EVENTS.TALLY_APPROVAL);
    });
  });

  describe('executeProposal:', async () => {
    beforeEach(async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
    });

    it('reverts if not in tally phase', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(
        vocdoniVoting.connect(signers[0]).executeProposal(0)
      ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally');
    });

    it('reverts if tally is not set', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      await expect(
        vocdoniVoting.connect(signers[0]).executeProposal(0)
      ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally');
    });

    it('reverts if tally is not approved by at minimum the minTallyApprovals parameter', async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      // set tally
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.reverted;

      // try to execute
      await expect(
        vocdoniVoting.connect(signers[0]).executeProposal(0)
      ).to.be.revertedWithCustomError(vocdoniVoting, 'NotEnoughApprovals');
    });

    it('reverts if min participation not reached', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      vocdoniVotingSettings.minParticipation = 200000;
      vocdoniProposalParams.totalVotingPower = BigNumber.from(100);
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      // set tally
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[1, 18, 0]]))
        .to.not.reverted;

      // try to execute
      await expect(
        vocdoniVoting.connect(signers[0]).executeProposal(0)
      ).to.be.revertedWithCustomError(
        vocdoniVoting,
        'MinParticipationNotReached'
      );
    });

    it('reverts if not enough support reached', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      vocdoniVotingSettings.supportThreshold = 900000;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      // set tally
      await expect(
        vocdoniVoting.connect(signers[0]).setTally(0, [[1, 200000, 0]])
      ).to.not.reverted;

      // try to execute
      await expect(
        vocdoniVoting.connect(signers[0]).executeProposal(0)
      ).to.be.revertedWithCustomError(
        vocdoniVoting,
        'SupportThresholdNotReached'
      );
    });

    // reverts if already executed
    it('reverts if already executed', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      vocdoniVotingSettings.supportThreshold = 0;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await expect(
        vocdoniVoting
          .connect(signers[0])
          .createProposal(
            ethers.utils.randomBytes(32),
            0,
            vocdoniProposalParams,
            dummyActions
          )
      ).to.not.be.reverted;
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.be.reverted;

      await expect(vocdoniVoting.connect(signers[0]).executeProposal(0)).to.not
        .be.reverted;

      await expect(
        vocdoniVoting.connect(signers[0]).executeProposal(0)
      ).to.be.revertedWithCustomError(vocdoniVoting, 'ProposalAlreadyExecuted');
    });

    it('emit an event if proposal executed', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address, signers[1].address], // signers[0] is listed
        vocdoniVotingSettings
      );
      await dao.grant(
        vocdoniVoting.address,
        dao.address,
        await vocdoniVoting.UPDATE_PLUGIN_SETTINGS_PERMISSION_ID()
      );
      await vocdoniVoting
        .connect(signers[0])
        .createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions
        );
      setTimeForNextBlock(
        (await ethers.provider.getBlock('latest')).timestamp + 4000
      );
      // set tally
      await expect(vocdoniVoting.connect(signers[0]).setTally(0, [[10, 0, 0]]))
        .to.not.reverted;
      // execute
      await expect(
        vocdoniVoting.connect(signers[0]).executeProposal(0)
      ).to.emit(vocdoniVoting, VOCDONI_EVENTS.PROPOSAL_EXECUTED);
    });
  });
});
