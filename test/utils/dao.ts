import {ethers} from 'hardhat';
import {
  DAO,
  DAO__factory,
} from '../../typechain';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {ContractFactory} from 'ethers';
import {upgrades} from 'hardhat';


export const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
export const daoExampleURI = 'https://example.com';

export const TOKEN_INTERFACE_IDS = {
  erc721ReceivedId: '0x150b7a02',
  erc1155ReceivedId: '0xf23a6e61',
  erc1155BatchReceivedId: '0xbc197c81',
  erc721InterfaceId: '0x150b7a02',
  erc1155InterfaceId: '0x4e2312e0',
};

export async function deployNewDAO(signer: SignerWithAddress): Promise<DAO> {
  const DAO = new DAO__factory(signer);
  const dao = await deployWithProxy<DAO>(DAO);

  await dao.initialize(
    '0x00',
    signer.address,
    ethers.constants.AddressZero,
    daoExampleURI
  );

  return dao;
}

type DeployOptions = {
  constructurArgs?: unknown[];
  proxyType?: 'uups';
};

// Used to deploy the implementation with the ERC1967 Proxy behind it.
// It is designed this way, because it might be desirable to avoid the OpenZeppelin upgrades package.
// In the future, this function might get replaced.
// NOTE: To avoid lots of changes in the whole test codebase, `deployWithProxy`
// won't automatically call `initialize` and it's the caller's responsibility to do so.
export async function deployWithProxy<T>(
  contractFactory: ContractFactory,
  options: DeployOptions = {}
): Promise<T> {
  // NOTE: taking this out of this file and putting this in each test file's
  // before hook seems a good idea for efficiency, though, all test files become
  // highly dependent on this package which is undesirable for now.
  upgrades.silenceWarnings();

  return upgrades.deployProxy(contractFactory, [], {
    kind: options.proxyType || 'uups',
    initializer: false,
    unsafeAllow: ['constructor'],
    constructorArgs: options.constructurArgs || [],
  }) as unknown as Promise<T>;
}
