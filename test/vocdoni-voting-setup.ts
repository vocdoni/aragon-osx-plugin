import {expect} from 'chai';
import {ethers} from 'hardhat';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';

import {
  ERC20,
  ERC20__factory,
  GovernanceERC20,
  GovernanceERC20__factory,
  GovernanceWrappedERC20,
  GovernanceWrappedERC20__factory,
  VocdoniVotingSetup,
  VocdoniVotingSetup__factory,
  VocdoniVoting__factory,
} from '../typechain';
import {deployNewDAO} from './utils/dao';
import {getInterfaceID} from './utils/helpers';
import {Operation} from '../utils/types';
import metadata from '../contracts/build-metadata.json';

import {VocdoniVotingSettings, pctToRatio, ONE_HOUR} from './utils/voting';
import {vocdoniVotingInterface} from './vocdoni-voting';
import {getNamedTypesFromMetadata} from './utils/metadata';
import {BigNumber} from 'ethers';

let defaultData: any;
let defaultVocdoniVotingSettings: VocdoniVotingSettings;
let defaultTokenSettings: {addr: string; name: string; symbol: string};
let defaultMintSettings: {receivers: string[]; amounts: number[]};

const abiCoder = ethers.utils.defaultAbiCoder;
const AddressZero = ethers.constants.AddressZero;
const EMPTY_DATA = '0x';

const prepareInstallationDataTypes = getNamedTypesFromMetadata(
  metadata.pluginSetup.prepareInstallation.inputs
);

const tokenName = 'name';
const tokenSymbol = 'symbol';
const merkleMintToAddressArray = [ethers.Wallet.createRandom().address];
const merkleMintToAmountArray = [1];

// Permissions
const UPDATE_PLUGIN_SETTINGS_PERMISSION_ID = ethers.utils.id(
  'UPDATE_PLUGIN_SETTINGS_PERMISSION'
);

const UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION_ID = ethers.utils.id(
  'UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION'
);
const UPGRADE_PERMISSION_ID = ethers.utils.id('UPGRADE_PLUGIN_PERMISSION');
const EXECUTE_PERMISSION_ID = ethers.utils.id('EXECUTE_PERMISSION');
const MINT_PERMISSION_ID = ethers.utils.id('MINT_PERMISSION');

describe('VocdoniVotingSetup', function () {
  let signers: SignerWithAddress[];
  let vocdoniVotingSetup: VocdoniVotingSetup;
  let governanceERC20Base: GovernanceERC20;
  let governanceWrappedERC20Base: GovernanceWrappedERC20;
  let implementationAddress: string;
  let targetDao: any;
  let erc20Token: ERC20;

  before(async () => {
    signers = await ethers.getSigners();
    targetDao = await deployNewDAO(signers[0]);

    defaultVocdoniVotingSettings = {
      onlyExecutionMultisigProposalCreation: true,
      minTallyApprovals: 1,
      minParticipation: 20,
      supportThreshold: 50,
      minVoteDuration: ONE_HOUR,
      minTallyDuration: ONE_HOUR,
      daoTokenAddress: AddressZero,
      minProposerVotingPower: BigNumber.from(10),
      censusStrategyURI: '',
    };

    const emptyName = '';
    const emptySymbol = '';

    defaultTokenSettings = {
      addr: AddressZero,
      name: emptyName,
      symbol: emptySymbol,
    };
    defaultMintSettings = {receivers: [], amounts: []};

    const GovernanceERC20Factory = new GovernanceERC20__factory(signers[0]);
    governanceERC20Base = await GovernanceERC20Factory.deploy(
      AddressZero,
      emptyName,
      emptySymbol,
      defaultMintSettings
    );

    const GovernanceWrappedERC20Factory = new GovernanceWrappedERC20__factory(
      signers[0]
    );
    governanceWrappedERC20Base = await GovernanceWrappedERC20Factory.deploy(
      AddressZero,
      emptyName,
      emptySymbol
    );

    const VocdoniVotingSetup = new VocdoniVotingSetup__factory(signers[0]);
    vocdoniVotingSetup = await VocdoniVotingSetup.deploy(
      governanceERC20Base.address,
      governanceWrappedERC20Base.address
    );

    implementationAddress = await vocdoniVotingSetup.implementation();

    const ERC20Token = new ERC20__factory(signers[0]);
    erc20Token = await ERC20Token.deploy(tokenName, tokenSymbol);

    defaultVocdoniVotingSettings.daoTokenAddress = erc20Token.address;

    defaultData = abiCoder.encode(prepareInstallationDataTypes, [
      Object.values([signers[0].address]),
      Object.values(defaultVocdoniVotingSettings),
      Object.values(defaultTokenSettings),
      Object.values(defaultMintSettings),
    ]);
  });

  it('does not support the empty interface', async () => {
    expect(await vocdoniVotingSetup.supportsInterface('0xffffffff')).to.be
      .false;
  });

  it('stores the bases provided through the constructor', async () => {
    expect(await vocdoniVotingSetup.governanceERC20Base()).to.be.eq(
      governanceERC20Base.address
    );
    expect(await vocdoniVotingSetup.governanceWrappedERC20Base()).to.be.eq(
      governanceWrappedERC20Base.address
    );
  });

  it('creates vocdoni voting base with the correct interface', async () => {
    const factory = new VocdoniVoting__factory(signers[0]);
    const vocdoniVoting = factory.attach(implementationAddress);

    expect(
      await vocdoniVoting.supportsInterface(
        getInterfaceID(vocdoniVotingInterface)
      )
    ).to.be.eq(true);
  });

  describe('prepareInstallation', async () => {
    it('fails if data is empty, or not of minimum length', async () => {
      await expect(
        vocdoniVotingSetup.prepareInstallation(targetDao.address, EMPTY_DATA)
      ).to.be.reverted;

      await expect(
        vocdoniVotingSetup.prepareInstallation(
          targetDao.address,
          defaultData.substring(0, defaultData.length - 2)
        )
      ).to.be.reverted;

      await expect(
        vocdoniVotingSetup.prepareInstallation(targetDao.address, defaultData)
      ).not.to.be.reverted;
    });

    it('fails if `MintSettings` arrays do not have the same length', async () => {
      const receivers: string[] = [AddressZero];
      const amounts: number[] = [];
      const data = abiCoder.encode(prepareInstallationDataTypes, [
        Object.values([signers[0].address]),
        Object.values(defaultVocdoniVotingSettings),
        Object.values(defaultTokenSettings),
        {receivers: receivers, amounts: amounts},
      ]);

      const nonce = await ethers.provider.getTransactionCount(
        vocdoniVotingSetup.address
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: vocdoniVotingSetup.address,
        nonce,
      });

      const GovernanceERC20 = new GovernanceERC20__factory(signers[0]);

      const govToken = GovernanceERC20.attach(anticipatedPluginAddress);

      await expect(
        vocdoniVotingSetup.prepareInstallation(targetDao.address, data)
      )
        .to.be.revertedWithCustomError(
          govToken,
          'MintSettingsArrayLengthMismatch'
        )
        .withArgs(1, 0);
    });

    it('fails if passed token address is not a contract', async () => {
      const tokenAddress = signers[0].address;
      const data = abiCoder.encode(prepareInstallationDataTypes, [
        Object.values([signers[0].address]),
        Object.values(defaultVocdoniVotingSettings),
        [tokenAddress, '', ''],
        Object.values(defaultMintSettings),
      ]);

      await expect(
        vocdoniVotingSetup.prepareInstallation(targetDao.address, data)
      )
        .to.be.revertedWithCustomError(vocdoniVotingSetup, 'TokenNotContract')
        .withArgs(tokenAddress);
    });

    it('fails if passed token address is not ERC20', async () => {
      const tokenAddress = implementationAddress;
      const data = abiCoder.encode(prepareInstallationDataTypes, [
        Object.values([signers[0].address]),
        Object.values(defaultVocdoniVotingSettings),
        [tokenAddress, '', ''],
        Object.values(defaultMintSettings),
      ]);

      await expect(
        vocdoniVotingSetup.prepareInstallation(targetDao.address, data)
      )
        .to.be.revertedWithCustomError(vocdoniVotingSetup, 'TokenNotERC20')
        .withArgs(tokenAddress);
    });

    it('correctly returns plugin, helpers and permissions, when an ERC20 token address is supplied', async () => {
      const nonce = await ethers.provider.getTransactionCount(
        vocdoniVotingSetup.address
      );
      const anticipatedWrappedTokenAddress = ethers.utils.getContractAddress({
        from: vocdoniVotingSetup.address,
        nonce: nonce,
      });
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: vocdoniVotingSetup.address,
        nonce: nonce + 1,
      });

      const data = abiCoder.encode(prepareInstallationDataTypes, [
        Object.values([signers[0].address]),
        Object.values(defaultVocdoniVotingSettings),
        [erc20Token.address, tokenName, tokenSymbol],
        Object.values(defaultMintSettings),
      ]);

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await vocdoniVotingSetup.callStatic.prepareInstallation(
        targetDao.address,
        data
      );

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(1);
      expect(helpers).to.be.deep.equal([anticipatedWrappedTokenAddress]);
      expect(permissions.length).to.be.equal(4);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          targetDao.address,
          AddressZero,
          UPDATE_PLUGIN_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          targetDao.address,
          AddressZero,
          UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          targetDao.address,
          AddressZero,
          UPGRADE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          targetDao.address,
          plugin,
          AddressZero,
          EXECUTE_PERMISSION_ID,
        ],
      ]);
    });

    it('correctly sets up `GovernanceWrappedERC20` helper, when an ERC20 token address is supplied', async () => {
      const nonce = await ethers.provider.getTransactionCount(
        vocdoniVotingSetup.address
      );
      const anticipatedWrappedTokenAddress = ethers.utils.getContractAddress({
        from: vocdoniVotingSetup.address,
        nonce: nonce,
      });

      const data = abiCoder.encode(prepareInstallationDataTypes, [
        Object.values([signers[0].address]),
        Object.values(defaultVocdoniVotingSettings),
        [erc20Token.address, tokenName, tokenSymbol],
        Object.values(defaultMintSettings),
      ]);

      await vocdoniVotingSetup.prepareInstallation(targetDao.address, data);

      const GovernanceWrappedERC20Factory = new GovernanceWrappedERC20__factory(
        signers[0]
      );
      const governanceWrappedERC20Contract =
        GovernanceWrappedERC20Factory.attach(anticipatedWrappedTokenAddress);

      expect(await governanceWrappedERC20Contract.name()).to.be.equal(
        tokenName
      );
      expect(await governanceWrappedERC20Contract.symbol()).to.be.equal(
        tokenSymbol
      );

      expect(await governanceWrappedERC20Contract.underlying()).to.be.equal(
        erc20Token.address
      );
    });

    it('correctly returns plugin, helpers and permissions, when a governance token address is supplied', async () => {
      const GovernanceERC20 = new GovernanceERC20__factory(signers[0]);
      const governanceERC20 = await GovernanceERC20.deploy(
        targetDao.address,
        'name',
        'symbol',
        {receivers: [], amounts: []}
      );

      const nonce = await ethers.provider.getTransactionCount(
        vocdoniVotingSetup.address
      );

      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: vocdoniVotingSetup.address,
        nonce: nonce,
      });

      const data = abiCoder.encode(prepareInstallationDataTypes, [
        Object.values([signers[0].address]),
        Object.values(defaultVocdoniVotingSettings),
        [governanceERC20.address, '', ''],
        Object.values(defaultMintSettings),
      ]);

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await vocdoniVotingSetup.callStatic.prepareInstallation(
        targetDao.address,
        data
      );

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(1);
      expect(helpers).to.be.deep.equal([governanceERC20.address]);
      expect(permissions.length).to.be.equal(4);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          targetDao.address,
          AddressZero,
          UPDATE_PLUGIN_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          targetDao.address,
          AddressZero,
          UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          targetDao.address,
          AddressZero,
          UPGRADE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          targetDao.address,
          plugin,
          AddressZero,
          EXECUTE_PERMISSION_ID,
        ],
      ]);
    });

    it('correctly returns plugin, helpers and permissions, when a token address is not supplied', async () => {
      const nonce = await ethers.provider.getTransactionCount(
        vocdoniVotingSetup.address
      );
      const anticipatedTokenAddress = ethers.utils.getContractAddress({
        from: vocdoniVotingSetup.address,
        nonce: nonce,
      });

      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: vocdoniVotingSetup.address,
        nonce: nonce + 1,
      });

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await vocdoniVotingSetup.callStatic.prepareInstallation(
        targetDao.address,
        defaultData
      );

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(1);
      expect(helpers).to.be.deep.equal([anticipatedTokenAddress]);
      expect(permissions.length).to.be.equal(5);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          targetDao.address,
          AddressZero,
          UPDATE_PLUGIN_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          targetDao.address,
          AddressZero,
          UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          targetDao.address,
          AddressZero,
          UPGRADE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          targetDao.address,
          plugin,
          AddressZero,
          EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          anticipatedTokenAddress,
          targetDao.address,
          AddressZero,
          MINT_PERMISSION_ID,
        ],
      ]);
    });

    it('correctly sets up the plugin and helpers, when a token address is not passed', async () => {
      const daoAddress = targetDao.address;

      const data = abiCoder.encode(prepareInstallationDataTypes, [
        Object.values([signers[0].address]),
        Object.values(defaultVocdoniVotingSettings),
        [AddressZero, tokenName, tokenSymbol],
        [merkleMintToAddressArray, merkleMintToAmountArray],
      ]);

      const nonce = await ethers.provider.getTransactionCount(
        vocdoniVotingSetup.address
      );
      const anticipatedTokenAddress = ethers.utils.getContractAddress({
        from: vocdoniVotingSetup.address,
        nonce: nonce,
      });
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: vocdoniVotingSetup.address,
        nonce: nonce + 1,
      });

      await vocdoniVotingSetup.prepareInstallation(daoAddress, data);

      // check plugin
      const PluginFactory = new VocdoniVoting__factory(signers[0]);
      const vocdoniVoting = PluginFactory.attach(anticipatedPluginAddress);

      expect(await vocdoniVoting.dao()).to.be.equal(daoAddress);

      // check helpers
      const GovernanceTokenFactory = new GovernanceERC20__factory(signers[0]);
      const governanceTokenContract = GovernanceTokenFactory.attach(
        anticipatedTokenAddress
      );

      expect(await governanceTokenContract.dao()).to.be.equal(daoAddress);
      expect(await governanceTokenContract.name()).to.be.equal(tokenName);
      expect(await governanceTokenContract.symbol()).to.be.equal(tokenSymbol);
    });
  });

  describe('prepareUninstallation', async () => {
    it('fails when the wrong number of helpers is supplied', async () => {
      const plugin = ethers.Wallet.createRandom().address;

      await expect(
        vocdoniVotingSetup.prepareUninstallation(targetDao.address, {
          plugin,
          currentHelpers: [],
          data: EMPTY_DATA,
        })
      )
        .to.be.revertedWithCustomError(
          vocdoniVotingSetup,
          'WrongHelpersArrayLength'
        )
        .withArgs(0);

      await expect(
        vocdoniVotingSetup.prepareUninstallation(targetDao.address, {
          plugin,
          currentHelpers: [AddressZero, AddressZero, AddressZero],
          data: EMPTY_DATA,
        })
      )
        .to.be.revertedWithCustomError(
          vocdoniVotingSetup,
          'WrongHelpersArrayLength'
        )
        .withArgs(3);
    });

    it('correctly returns permissions, when the required number of helpers is supplied', async () => {
      const plugin = ethers.Wallet.createRandom().address;
      const GovernanceERC20 = new GovernanceERC20__factory(signers[0]);
      const GovernanceWrappedERC20 = new GovernanceWrappedERC20__factory(
        signers[0]
      );
      const governanceERC20 = await GovernanceERC20.deploy(
        targetDao.address,
        tokenName,
        tokenSymbol,
        {receivers: [], amounts: []}
      );

      const governanceWrappedERC20 = await GovernanceWrappedERC20.deploy(
        governanceERC20.address,
        tokenName,
        tokenSymbol
      );

      // When the helpers contain governanceWrappedERC20 token
      const permissions1 =
        await vocdoniVotingSetup.callStatic.prepareUninstallation(
          targetDao.address,
          {
            plugin,
            currentHelpers: [governanceWrappedERC20.address],
            data: EMPTY_DATA,
          }
        );

      const essentialPermissions = [
        [
          Operation.Revoke,
          plugin,
          targetDao.address,
          AddressZero,
          UPDATE_PLUGIN_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin,
          targetDao.address,
          AddressZero,
          UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin,
          targetDao.address,
          AddressZero,
          UPGRADE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          targetDao.address,
          plugin,
          AddressZero,
          EXECUTE_PERMISSION_ID,
        ],
      ];

      expect(permissions1.length).to.be.equal(4);
      expect(permissions1).to.deep.equal([...essentialPermissions]);

      const permissions2 =
        await vocdoniVotingSetup.callStatic.prepareUninstallation(
          targetDao.address,
          {
            plugin,
            currentHelpers: [governanceERC20.address],
            data: EMPTY_DATA,
          }
        );

      expect(permissions2.length).to.be.equal(5);
      expect(permissions2).to.deep.equal([
        ...essentialPermissions,
        [
          Operation.Revoke,
          governanceERC20.address,
          targetDao.address,
          AddressZero,
          MINT_PERMISSION_ID,
        ],
      ]);
    });
  });
});
