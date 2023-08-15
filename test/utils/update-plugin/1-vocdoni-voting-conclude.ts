import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {UPDATE_INFOS} from '../../../utils/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log('\nConcluding VocdoniVoting Plugin Update');

  hre.aragonToVerifyContracts.push(await hre.deployments.get('VocdoniVotingSetup'));
};
export default func;
func.tags = ['VocdoniVotingPlugin', 'Verify'].concat(UPDATE_INFOS['v1_3_0'].tags);
