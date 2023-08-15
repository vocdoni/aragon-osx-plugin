import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {extendEnvironment, HardhatUserConfig} from 'hardhat/config';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import '@openzeppelin/hardhat-upgrades';
import 'solidity-coverage';
import 'solidity-docgen';

import {AragonPluginRepos, TestingFork} from './utils/types';

dotenv.config();

const ETH_KEY = process.env.ETH_KEY;
const accounts = ETH_KEY ? ETH_KEY.split(',') : [];

const networks = JSON.parse(
  fs.readFileSync(path.join(__dirname, './networks.json'), 'utf8')
);

// add accounts to network configs
for (const network of Object.keys(networks)) {
  networks[network].accounts = accounts;
}

// Extend HardhatRuntimeEnvironment
extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  const aragonPluginRepos: AragonPluginRepos = {
    'address-list-voting': '',
    'token-voting': '',
    admin: '',
    multisig: '',
    vocdoni: '',
  };
  const testingFork: TestingFork = {
    network: '',
    osxVersion: '',
  };
  hre.aragonPluginRepos = aragonPluginRepos;
  hre.aragonToVerifyContracts = [];
  hre.managingDAOVocdoniVotingPluginAddress = '';
  hre.managingDAOActions = [];
  hre.testingFork = testingFork;
});

const ENABLE_DEPLOY_TEST = process.env.TEST_UPDATE_DEPLOY_SCRIPT !== undefined;

console.log('Is deploy test is enabled: ', ENABLE_DEPLOY_TEST);

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000000,
      },
      outputSelection: {
        '*': {
          '*': ['storageLayout'],
        },
      },
    },
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      blockGasLimit: 3000000000, // really high to test some things that are only possible with a higher block gas limit
      gasPrice: 80000000000,
      deploy: ENABLE_DEPLOY_TEST
        ? ['./deploy']
        : ['./deploy/new', './deploy/verification'],
    },
    ...networks,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    currency: 'USD',
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_KEY || '',
      rinkeby: process.env.ETHERSCAN_KEY || '',
      goerli: process.env.ETHERSCAN_KEY || '',
      polygon: process.env.POLYGONSCAN_KEY || '',
      polygonMumbai: process.env.POLYGONSCAN_KEY || '',
      arbitrumOne: process.env.ARBISCAN_KEY || '',
      arbitrumTestnet: process.env.ARBISCAN_KEY || '',
    },
    customChains: [],
  },
  namedAccounts: {
    deployer: 0,
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
    deploy: './deploy',
  },
  mocha: {
    timeout: 60000, // 60 seconds // increase the timeout for subdomain validation tests
  },
};

export default config;
