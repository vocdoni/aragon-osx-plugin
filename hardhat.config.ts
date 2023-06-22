import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {extendEnvironment, HardhatUserConfig} from 'hardhat/config';
import "@nomicfoundation/hardhat-toolbox";
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import '@openzeppelin/hardhat-upgrades';
import 'solidity-coverage';
import 'solidity-docgen';
import '@openzeppelin/hardhat-upgrades';
import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'

import { TestingFork, AragonPluginRepos } from './test/utils/types';

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

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 2000000,
      }
    }
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      blockGasLimit: 3000000000, // really high to test some things that are only possible with a higher block gas limit
      gasPrice: 80000000000,
    }
  },
};

export default config;
