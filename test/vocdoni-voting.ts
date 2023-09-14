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
} from '../typechain';

import {
  VOCDONI_EVENTS,
} from './utils/event';
import {deployNewDAO} from './utils/dao';
import {
  timestampIn,
} from './utils/voting';
import {deployWithProxy} from './utils/dao';
import {getInterfaceID, OZ_ERRORS} from './utils/helpers';

export const vocdoniVotingInterface = new ethers.utils.Interface([
  'function addCommitteeMembers(address[] calldata _members)',
  'function removeCommitteeMembers(address[] calldata _members)',
  'function isCommitteeMember(address _member)',
  'function setTally(uint256 _proposalId, uint256[][] memory _tally)',
  'function approveTally(uint256 _proposalId, bool _tryExecution)',
  'function executeProposal(uint256 _proposalId)'
  ]);
  
export type VocdoniVotingSettings = {
    onlyCommitteeProposalCreation: boolean;
    minTallyApprovals: number;
    minDuration: number;
    expirationTime: number;
    minParticipation: number;
    supportThreshold: number;
    daoTokenAddress: string;
    censusStrategy: string;
    minProposerVotingPower: number;
  };

export type vocdoniProposalParams = {
  censusBlock: number;
  securityBlock: number;
  startDate: number;
  endDate: number;
  expirationDate: number;
};


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
  let vocdoniProposalParams: vocdoniProposalParams;
  let governanceErc20Mock: GovernanceERC20Mock;
  let GovernanceERC20Mock: GovernanceERC20Mock__factory;

  const id = 0;

  async function setBalances(
    balances: {receiver: string; amount: number | BigNumber}[]
  ) {
    const promises = balances.map(balance =>
      governanceErc20Mock.setBalance(balance.receiver, balance.amount)
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

    vocdoniVotingSettings = {
      onlyCommitteeProposalCreation: true,
      minTallyApprovals: 2,
      minDuration: 1,
      expirationTime: 10000,
      minParticipation: 0,
      supportThreshold: 0,
      daoTokenAddress: governanceErc20Mock.address,
      censusStrategy: "",
      minProposerVotingPower: 0,
    };

    vocdoniProposalParams = {
      censusBlock: await ethers.provider.getBlockNumber(),
      securityBlock: await ethers.provider.getBlockNumber(),
      startDate: 0,
      endDate: 0,
      expirationDate: 0,
    };

    const VocdoniVotingFactory = new VocdoniVoting__factory(signers[0]);
    vocdoniVoting = await deployWithProxy(VocdoniVotingFactory);
    // grant execute permissions to the plugin
    dao.grant(
      dao.address,
      vocdoniVoting.address,
      ethers.utils.id('EXECUTE_PERMISSION')
    );
    // grant committee permissions to signers[0]
    dao.grant(
      vocdoniVoting.address,
      signers[0].address,
      ethers.utils.id('UPDATE_PLUGIN_SETTINGS_PERMISSION')
    );
    dao.grant(
      vocdoniVoting.address,
      signers[0].address,
      ethers.utils.id('UPDATE_PLUGIN_COMMITTEE_PERMISSION')
    );
    // grant committee permissions to signers[1]
    dao.grant(
      vocdoniVoting.address,
      signers[1].address,
      ethers.utils.id('UPDATE_PLUGIN_SETTINGS_PERMISSION')
    );
    dao.grant(
      vocdoniVoting.address,
      signers[1].address,
      ethers.utils.id('UPDATE_PLUGIN_COMMITTEE_PERMISSION')
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

    it('should set the `minTallyApprovals`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect((await vocdoniVoting.getPluginSettings()).minTallyApprovals).to.be.eq(
        vocdoniVotingSettings.minTallyApprovals
      );
    });

    it('should set `minDuration`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect((await vocdoniVoting.getPluginSettings()).minDuration).to.be.eq(
        vocdoniVotingSettings.minDuration
      );
    });

    it('should set `daoTokenAddress`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect((await vocdoniVoting.getPluginSettings()).daoTokenAddress).to.be.eq(
        vocdoniVotingSettings.daoTokenAddress
      );
    });

    it('should set `censusStrategy`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect((await vocdoniVoting.getPluginSettings()).censusStrategy).to.be.eq(
        vocdoniVotingSettings.censusStrategy
      );
    });

    it('should set `minProposerVotingPower`', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      );
      expect((await vocdoniVoting.getPluginSettings()).minProposerVotingPower).to.be.eq(
        vocdoniVotingSettings.minProposerVotingPower
      );
    });

    it('should set `minParticipation`', async() => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      )
      expect((await vocdoniVoting.getPluginSettings()).minParticipation).to.be.eq(
        vocdoniVotingSettings.minParticipation
      );
    });

    it('should set `supportThreshold`', async() => {
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 5).map(s => s.address),
        vocdoniVotingSettings
      )
      expect((await vocdoniVoting.getPluginSettings()).supportThreshold).to.be.eq(
        vocdoniVotingSettings.supportThreshold
      );
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
        .withArgs(vocdoniVotingSettings.onlyCommitteeProposalCreation,
          vocdoniVotingSettings.minTallyApprovals,
          vocdoniVotingSettings.minDuration,
          vocdoniVotingSettings.expirationTime,
          vocdoniVotingSettings.minParticipation,
          vocdoniVotingSettings.supportThreshold,
          vocdoniVotingSettings.daoTokenAddress,
          vocdoniVotingSettings.censusStrategy,
          vocdoniVotingSettings.minProposerVotingPower
        );
    });

    it('should revert if members list is longer than uint16 max', async () => {
      const megaMember = signers[1];
      const members: string[] = new Array(65537).fill(megaMember.address);
      await expect(vocdoniVoting.initialize(dao.address, members, vocdoniVotingSettings))
        .to.revertedWithCustomError(vocdoniVoting, 'AddresslistLengthOutOfBounds')
        .withArgs(65535, members.length);
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
        .withArgs(vocdoniVotingSettings.onlyCommitteeProposalCreation,
          vocdoniVotingSettings.minTallyApprovals,
          vocdoniVotingSettings.minDuration,
          vocdoniVotingSettings.expirationTime,
          vocdoniVotingSettings.minParticipation,
          vocdoniVotingSettings.supportThreshold,
          vocdoniVotingSettings.daoTokenAddress,
          vocdoniVotingSettings.censusStrategy,
          vocdoniVotingSettings.minProposerVotingPower
        );
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

  describe('isCommitteeMember', async () => {
    it('should return false, if user is not listed', async () => {
      expect(await vocdoniVoting.isCommitteeMember(signers[0].address)).to.be.false;
    });

    it('should return true if user is in the latest list', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address],
        vocdoniVotingSettings
      );
      expect(await vocdoniVoting.isCommitteeMember(signers[0].address)).to.be.true;
    });
  });

  describe('addCommitteeMembers:', async () => {
    it('should add new members to the committee address list and emit the `CommitteeMembersAdded` event', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address],
        vocdoniVotingSettings
      );

      expect(await vocdoniVoting.isListed(signers[0].address)).to.equal(true);
      expect(await vocdoniVoting.isListed(signers[1].address)).to.equal(false);

      // add a new member
      await expect(vocdoniVoting.addCommitteeMembers([signers[1].address]))
        .to.emit(vocdoniVoting, VOCDONI_EVENTS.COMMITTEE_MEMBERS_ADDED)
        //.withArgs({newMembers: [signers[1].address]});

      expect(await vocdoniVoting.isListed(signers[0].address)).to.equal(true);
      expect(await vocdoniVoting.isListed(signers[1].address)).to.equal(true);
    });
  });

  describe('removeCommitteeMembers:', async () => {
    it('should remove users from the committee address list and emit the `CommitteeMembersRemoved` event', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      await vocdoniVoting.initialize(
        dao.address,
        signers.slice(0, 2).map(s => s.address),
        vocdoniVotingSettings
      );

      expect(await vocdoniVoting.isListed(signers[0].address)).to.equal(true);
      expect(await vocdoniVoting.isListed(signers[1].address)).to.equal(true);

      // remove an existing member
      await expect(vocdoniVoting.removeCommitteeMembers([signers[1].address]))
        .to.emit(vocdoniVoting, VOCDONI_EVENTS.COMMITTEE_MEMBERS_REMOVED)
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

      await expect(vocdoniVoting.removeCommitteeMembers([signers[0].address]))
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

      await expect(vocdoniVoting.removeCommitteeMembers([signers[1].address])).not.to.be
        .reverted;

      await expect(vocdoniVoting.removeCommitteeMembers([signers[2].address]))
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
      
      await expect(vocdoniVoting.createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions,
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
          dummyActions,
      );
      // create a new proposal for the proposalCounter to be incremented
      await expect(
        vocdoniVoting.createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions,
        )
      ).not.to.be.reverted;
    
      const proposalId1 = await vocdoniVoting.callStatic.createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
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
            dummyActions,
          )
      )
        .to.emit(vocdoniVoting, VOCDONI_EVENTS.PROPOSAL_CREATED)
    });

    it('reverts if the vocdoniVoting settings have been changed in the same block', async () => {
      vocdoniVotingSettings.minDuration = 1;
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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

      const vochainProposalId = ethers.utils.randomBytes(32)
      await vocdoniVoting.connect(signers[0]).createProposal(
        vochainProposalId,
        0,
        vocdoniProposalParams,
        [
          {
            to: vocdoniVoting.address,
            value: 0,
            data: vocdoniVoting.interface.encodeFunctionData(
              'updatePluginSettings',
              [
                {
                  minTallyApprovals: 2,
                  minDuration: 1,
                  minParticipation: 0,
                  expirationTime: 10000,
                  supportThreshold: 0,
                  daoTokenAddress: ethers.constants.AddressZero,
                  censusStrategy: 0,
                  minProposerVotingPower: 0,
                },
              ]
            ),
          },
        ],
      );
      await vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      ) // tally already approved by signers[0]


      await vocdoniVoting.connect(signers[1]).approveTally(
        0,
        true
      )

      await ethers.provider.send('evm_setAutomine', [false]);

      await vocdoniVoting
          .connect(signers[0])
          .createProposal(ethers.utils.randomBytes(32), 0, vocdoniProposalParams, dummyActions)
      
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        1,
        [[10,0,0]],
      )).to.revertedWithCustomError(vocdoniVoting, 'PluginSettingsUpdatedTooRecently')
          
      await ethers.provider.send('evm_setAutomine', [true]);
    });

    context('onlyCommitteProposalCreation', async () => {
      it('creates a proposal when unlisted accounts are allowed', async () => {
        vocdoniVotingSettings.onlyCommitteeProposalCreation = false
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
              dummyActions,
            )
        )
          .to.emit(vocdoniVoting, VOCDONI_EVENTS.PROPOSAL_CREATED)
      });

      it('creates a proposal when unlisted accounts are allowed and have tokens', async () => {
        vocdoniVotingSettings.onlyCommitteeProposalCreation = false
        vocdoniVotingSettings.minProposerVotingPower = 1
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
              dummyActions,
            )
        )
          .to.emit(vocdoniVoting, VOCDONI_EVENTS.PROPOSAL_CREATED)
        
        await expect(
          vocdoniVoting
            .connect(signers[3]) // not listed
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions,
            )
        )
          .to.revertedWithCustomError(vocdoniVoting, 'NotEnoughVotingPower')
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
              dummyActions,
            )
        )
          .to.revertedWithCustomError(vocdoniVoting, 'OnlyCommittee')
      });
    });
    
    context('process dates:', async () => {
      it('reverts if invalid start date', async () => {
        let currentBlock = await ethers.provider.getBlock("latest");
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
        ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidStartDate')

        vocdoniProposalParams.startDate = currentBlock.timestamp + 10
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.not.be.reverted

  
        vocdoniProposalParams.startDate = 0
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.not.be.reverted
      });

      it('reverts if invalid end date', async() => {
        let currentBlock = await ethers.provider.getBlock("latest");
        vocdoniProposalParams.endDate = currentBlock.timestamp;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidEndDate')
        
        vocdoniProposalParams.endDate = currentBlock.timestamp - 1;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidEndDate')

        vocdoniProposalParams.endDate = 0;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.not.be.reverted
      })
      
      it('reverts if invalid expiration date', async() => {
        let currentBlock = await ethers.provider.getBlock("latest");
        vocdoniProposalParams.expirationDate = 6744073709551610;
        await expect(
          vocdoniVoting
            .connect(signers[0])
            .createProposal(
              ethers.utils.randomBytes(32),
              0,
              vocdoniProposalParams,
              dummyActions
            )
        ).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidExpirationDate')
      }) 
    })
  });

  describe('setTally:', async () => {
    beforeEach(async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      
    });

    it('reverts if not a committee member', async () => {
      await vocdoniVoting.initialize(
        dao.address,
        [signers[0].address], // signers[0] is listed
        vocdoniVotingSettings
      );

      await expect(vocdoniVoting.createProposal(
          ethers.utils.randomBytes(32),
          0,
          vocdoniProposalParams,
          dummyActions,
        )
      ).not.to.be.reverted;

      await expect(vocdoniVoting.connect(signers[1]).setTally(
        0,
        [[10,0,0]],
      )).to.be.revertedWithCustomError(vocdoniVoting, 'OnlyCommittee').withArgs(signers[1].address);
    });

    it('reverts if plugin settings changed after the process stored security block', async () => {
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
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      // change plugin settings
      const vochainProposalId = ethers.utils.randomBytes(32)
      let proposalParams = {
        censusBlock: await ethers.provider.getBlockNumber(),
        securityBlock: await ethers.provider.getBlockNumber(),
        startDate: 0,
        endDate: 0,
        expirationDate: await timestampIn(1000),
      };
      await vocdoniVoting.connect(signers[0]).createProposal(
        vochainProposalId,
        0,
        proposalParams,
        [
          {
            to: vocdoniVoting.address,
            value: 0,
            data: vocdoniVoting.interface.encodeFunctionData(
              'updatePluginSettings',
              [
                {
                  minTallyApprovals: 1,
                  minDuration: 1,
                  expirationTime: 10000,
                  minParticipation: 0,
                  supportThreshold: 0,
                  daoTokenAddress: ethers.constants.AddressZero,
                  censusStrategy: "TKN",
                  minProposerVotingPower: 0,
                },
              ]
            ),
          },
        ],
      );
      await vocdoniVoting.connect(signers[0]).setTally(
        1,
        [[10,0,0]],
      ) // tally already approved by signers[0]
      await vocdoniVoting.connect(signers[1]).approveTally(
        1,
        true
      )

    // should revert if trying to set tally on process 0
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.revertedWithCustomError(vocdoniVoting, 'PluginSettingsUpdatedTooRecently')
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
      let proposalParams = {
        censusBlock: await ethers.provider.getBlockNumber(),
        securityBlock: await ethers.provider.getBlockNumber(),
        startDate: 0,
        endDate: await timestampIn(3000),
        expirationDate: await timestampIn(4000),
      };
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        proposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.revertedWithCustomError(vocdoniVoting, 'ProposalNotInTallyPhase')
    });

    it('reverts if invalid tally', async () => {
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0],[0,20,2]],
      )).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally')

      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[0,0,0,20]],
      )).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally')
    });

    it('reverts if trying to set same tally twice', async () => {
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.not.reverted

      await expect(vocdoniVoting.connect(signers[1]).setTally(
        0,
        [[10,0,0]],
      )).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally')
    });

    it('reverts if trying to set the tally and already approved', async () => {
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.not.reverted

      await expect(vocdoniVoting.connect(signers[1]).setTally(
        0,
        [[10,0,0]],
      )).to.be.revertedWithCustomError(vocdoniVoting, 'TallyAlreadyApproved')
    });

    it('resets the approval counter if tally is already set but changed by another committee member', async () => {
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.not.reverted

      let proposal = await vocdoniVoting.connect(signers[0]).getProposal(0)
      expect(proposal.approvers.length).to.be.equal(1)

      await expect(vocdoniVoting.connect(signers[1]).setTally(
        0,
        [[0,10,0]],
      )).to.not.reverted

      proposal = await vocdoniVoting.connect(signers[0]).getProposal(0)
      expect(proposal.approvers.length).to.be.equal(1)
      expect(proposal.approvers[0]).to.be.equal(signers[1].address)
    })

    it('sets the tally correctly and modifies the approvers count', async () => {
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.not.reverted

      await expect(vocdoniVoting.connect(signers[1]).approveTally(
        0,
        false,
      )).to.not.reverted

      let proposal = await vocdoniVoting.connect(signers[0]).getProposal(0)
      expect(proposal.approvers.length).to.be.equal(2)
      expect(proposal.tally[0][0]).to.be.equal(10)
      expect(proposal.tally[0][1]).to.be.equal(0)
      expect(proposal.tally[0][2]).to.be.equal(0)
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
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      let setTallyTx = await vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]])
      expect(setTallyTx).to.emit(vocdoniVoting, VOCDONI_EVENTS.TALLY_SET)
      expect(setTallyTx).to.emit(vocdoniVoting, VOCDONI_EVENTS.TALLY_APPROVED)
    });
  });

  describe('approveTally:', async () => {
    beforeEach(async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      
    });

    it('reverts if not a committee member', async () => {
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.not.reverted
      await expect(vocdoniVoting.connect(signers[1]).approveTally(
        0,
        false
      )).to.be.revertedWithCustomError(vocdoniVoting, 'OnlyCommittee').withArgs(signers[1].address);
    });

    it('reverts if tally is not set', async () => {
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).approveTally(
        0,
        false
      )).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally');
    });

    it('committee member can approve the tally only once if not changed', async () => {  
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;  
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
      vocdoniProposalParams.expirationDate = await timestampIn(10000)
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.not.reverted
      await expect(vocdoniVoting.connect(signers[0]).approveTally(
        0,
        false
      )).to.be.revertedWithCustomError(vocdoniVoting, 'TallyAlreadyApproved')
      // approve with signer[1]
      await expect(vocdoniVoting.connect(signers[1]).approveTally(
        0,
        false
      )).to.not.reverted

      let proposal = await vocdoniVoting.connect(signers[0]).getProposal(0)
      expect(proposal.approvers.length).to.be.equal(2)
    });

    it('committee member can approve the tally only once if changed', async () => {
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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
      vocdoniProposalParams.expirationDate = await timestampIn(10000)
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.not.reverted

      let proposal = await vocdoniVoting.connect(signers[0]).getProposal(0)
      expect(proposal.approvers.length).to.be.equal(1)
      expect(proposal.approvers[0]).to.be.equal(signers[0].address)
      
      await expect(vocdoniVoting.connect(signers[1]).setTally(
        0,
        [[9,0,0]],
      )).to.not.reverted
      
      proposal = await vocdoniVoting.connect(signers[0]).getProposal(0)
      expect(proposal.approvers.length).to.be.equal(1)
      expect(proposal.approvers[0]).to.be.equal(signers[1].address)

      await expect(vocdoniVoting.connect(signers[1]).approveTally(
        0,
        false
      )).to.be.revertedWithCustomError(vocdoniVoting, 'TallyAlreadyApproved')
    });

    it('emits an event when the tally is approved', async () => {
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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

      vocdoniProposalParams.expirationDate = await timestampIn(10000)
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )

      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.not.reverted
      
      await expect(vocdoniVoting.connect(signers[1]).approveTally(
        0,
        false
      )).to.emit(vocdoniVoting, VOCDONI_EVENTS.TALLY_APPROVED)
    });
  });

  describe('executeProposal:', async () => {
    beforeEach(async () => {
      vocdoniVotingSettings.minTallyApprovals = 2;
      
    });

    it ('reverts if not in tally phase', async () => {
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
      vocdoniProposalParams.endDate = await timestampIn(10000)
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).executeProposal(
        0
      )).to.be.revertedWithCustomError(vocdoniVoting, 'ProposalNotInTallyPhase')
    });

    it ('reverts if tally is not set', async () => {
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
      vocdoniProposalParams.expirationDate = await timestampIn(10000)
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      await expect(vocdoniVoting.connect(signers[0]).executeProposal(
        0
      )).to.be.revertedWithCustomError(vocdoniVoting, 'InvalidTally')
    });

    it ('reverts if tally is not approved by at minimum the minTallyApprovals parameter', async () => {
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
      vocdoniProposalParams.expirationDate = await timestampIn(10000)
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      // set tally
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.not.reverted

      // try to execute
      await expect(vocdoniVoting.connect(signers[0]).executeProposal(
        0
      )).to.be.revertedWithCustomError(vocdoniVoting, 'NotEnoughApprovals')
    });

    it('reverts if min participation not reached', async () => {
      vocdoniVotingSettings.minTallyApprovals = 1;
      vocdoniVotingSettings.minParticipation = 50;
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
      vocdoniProposalParams.expirationDate = await timestampIn(10000)
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      // set tally
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[1,2,0]],
      )).to.not.reverted

      // try to execute
      await expect(vocdoniVoting.connect(signers[0]).executeProposal(
        0
      )).to.be.revertedWithCustomError(vocdoniVoting, 'MinParticipationNotReached')
    });

    it ('reverts if not enough support reached', async () => {
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
      vocdoniProposalParams.expirationDate = await timestampIn(10000)
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      // set tally
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[1,200000,0]],
      )).to.not.reverted

      // try to execute
      await expect(vocdoniVoting.connect(signers[0]).executeProposal(
        0
      )).to.be.revertedWithCustomError(vocdoniVoting, 'SupportThresholdNotReached')
    })

    it ('emit an event if proposal executed', async () => {
      vocdoniProposalParams.expirationDate = (await ethers.provider.getBlock('latest')).timestamp + 1000;
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
      await vocdoniVoting.connect(signers[0]).createProposal(
        ethers.utils.randomBytes(32),
        0,
        vocdoniProposalParams,
        dummyActions,
      )
      // set tally
      await expect(vocdoniVoting.connect(signers[0]).setTally(
        0,
        [[10,0,0]],
      )).to.not.reverted
      // execute
      await expect(vocdoniVoting.connect(signers[0]).executeProposal(
        0
      )).to.emit(vocdoniVoting, VOCDONI_EVENTS.PROPOSAL_EXECUTED)
    });
  });
});
