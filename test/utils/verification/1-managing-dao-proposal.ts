// import {writeFile} from 'fs/promises';
// import {DeployFunction} from 'hardhat-deploy/types';
// import {HardhatRuntimeEnvironment} from 'hardhat/types';
// import {VocdoniVoting__factory} from '../../../typechain';
// import {getManagingDAOVocdoniVotingAddress, uploadToIPFS} from '../helpers';

// const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
//   console.log('\nCreating managing DAO Proposal');
//   if (hre.managingDAOActions.length === 0) {
//     console.log('No actions defined');
//     return;
//   }

//   const {ethers, network} = hre;
//   const [deployer] = await ethers.getSigners();

//   const managingDAOVocdoniVotingAddress = await getManagingDAOVocdoniVotingAddress(hre);
//   const managingDAOVocdoniVoting = VocdoniVoting__factory.connect(
//     managingDAOVocdoniVotingAddress,
//     ethers.provider
//   );
//   const managingDAOVocdoniVotingSettings =
//     await managingDAOVocdoniVoting.callStatic.multisigSettings();

//   const proposalDescription = hre.managingDAOActions
//     .map(action => action.description)
//     .join('\n');
//   const cid = await uploadToIPFS(proposalDescription, network.name);

//   if (managingDAOVocdoniVotingSettings.onlyListed) {
//     if (!(await managingDAOVocdoniVoting.callStatic.isMember(deployer.address))) {
//       console.log(
//         `ManagingDAOVocdoniVoting (${managingDAOVocdoniVotingAddress}) doesn't allow deployer ${deployer.address} to create proposal.`
//       );
//       const tx = await managingDAOVocdoniVoting.populateTransaction.createProposal(
//         ethers.utils.toUtf8Bytes(`ipfs://${cid}`), // CHANGE TO VOCHAIN PROCESS ID
//         ethers.utils.toUtf8Bytes(`ipfs://${cid}`),
//         0,
//         Math.round(Date.now() / 1000) + 30 * 24 * 60 * 60, // Lets the proposal end in 30 days,
//         Math.round(Date.now() / 1000) + 35 * 24 * 60 * 60, // Lets the proposal expiry in 35 days,
//         hre.managingDAOActions,
//         0,
//        );
//       await writeFile('./managingDAOTX.json', JSON.stringify(tx));
//       console.log('Saved transaction to managingDAOTX.json');
//     }
//     return;
//   }

//   console.log(
//     `ManagingDAOVocdoniVoting (${managingDAOVocdoniVotingAddress}) does allow deployer ${deployer.address} to create proposal.`
//   );
//   const tx = await managingDAOVocdoniVoting.createProposal(
//     ethers.utils.toUtf8Bytes(`ipfs://${cid}`), // CHANGE TO VOCHAIN PROCESS ID
//     ethers.utils.toUtf8Bytes(`ipfs://${cid}`),
//     0,
//     Math.round(Date.now() / 1000) + 30 * 24 * 60 * 60, // Lets the proposal end in 30 days,
//     Math.round(Date.now() / 1000) + 35 * 24 * 60 * 60, // Lets the proposal expiry in 35 days,
//     hre.managingDAOActions,
//     0,
//   );
//   console.log(`Creating proposal with tx ${tx.hash}`);
//   await tx.wait();
//   console.log(
//     `Proposal created in managingDAO VocdoniVoting ${managingDAOVocdoniVotingAddress}`
//   );
// };
// export default func;
// func.tags = ['New', 'ManagingDAOProposal'];
