// JSON artifacts of the contracts

// core
//// dao
import * as DAO from '../artifacts/@aragon/osx/core/dao/DAO.sol/DAO.json';

//// Permission
import * as PermissionManager from '../artifacts/@aragon/osx/core/permission/PermissionManager.sol/PermissionManager.json';
import * as PermissionLib from '../artifacts/@aragon/osx/core/permission/PermissionLib.sol/PermissionLib.json';

// framework
//// dao
import * as DAOFactory from '../artifacts/@aragon/osx/framework/dao/DAOFactory.sol/DAOFactory.json';
import * as DAORegistry from '../artifacts/@aragon/osx/framework/dao/DAORegistry.sol/DAORegistry.json';

//// Plugin
///// Repo
import * as PluginRepo from '../artifacts/@aragon/osx/framework/plugin/repo/PluginRepo.sol/PluginRepo.json';
import * as PluginRepoFactory from '../artifacts/@aragon/osx/framework/plugin/repo/PluginRepoFactory.sol/PluginRepoFactory.json';
import * as PluginRepoRegistry from '../artifacts/@aragon/osx/framework/plugin/repo/PluginRepoRegistry.sol/PluginRepoRegistry.json';

///// Setup
import * as PluginSetupProcessor from '../artifacts/@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol/PluginSetupProcessor.json';

// Plugin
import * as VocdoniVoting from '../artifacts/contracts/VocdoniVoting.sol/VocdoniVoting.json';
import * as VocdoniVotingSetup from '../artifacts/contracts/VocdoniVoting.sol/VocdoniVoting.json';

// Token
//// ERC20
////// Governance
import * as GovernanceERC20 from '../artifacts/@aragon/osx/token/ERC20/governance/GovernanceERC20.sol/GovernanceERC20.json';
import * as GovernanceWrappedERC20 from '../artifacts/@aragon/osx/token/ERC20/governance/GovernanceWrappedERC20.sol/GovernanceWrappedERC20.json';

export default {
  DAO,
  PermissionManager,
  PermissionLib,

  DAOFactory,
  DAORegistry,

  PluginRepo,
  PluginRepoFactory,
  PluginRepoRegistry,

  PluginSetupProcessor,

  VocdoniVoting,
  VocdoniVotingSetup,

  GovernanceERC20,
  GovernanceWrappedERC20,
};
