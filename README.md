# Vocdoni based voting plugin for Aragon OSx

This repository contains the smart contracts required for allowing any Aragon DAO to use the Vocdoni voting protocol as the DAO voting backend.

An Aragon DAO can install this plugin to enable its members to use the Vocdoni voting protocol.

The voting processes are held on the Vocdoni blockchain thus giving the DAO members the ability to:

- Vote without any cost
- Vote anonymously using zk-SNARKs technology
- Create custom censuses with complex strategies
- Have full transparency and verifiability of the voting process and the votes casted
- Execute on-chain defined actions based on the voting results
- Vote from any device (mobile, desktop, etc.)

For more information about the Vocdoni voting protocol, please refer to the [Vocdoni documentation](https://developer.vocdoni.io/protocol/overview).

## How it works

This repository should not be viewed as an isolated, autonomous software artifact but as a part of a bigger system.

The main idea of the plugin is to interact simultaneously with the Vocdoni voting protocol and the Aragon OSx protocol to enable DAO governance.

The plugin enables token voting governance supported by an execution multisig. The execution multisig is a temporary key piece that hold special rights over the DAO.

The plugin follows the UUPS upgradeability pattern.

### Plugin configuration & permissions

The plugin is configured with the following parameters:

```solidity
/// @notice A container for the Vocdoni voting plugin settings
/// @param onlyExecutionMultisigProposalCreation If true, only executionMultisig members can create proposals.
/// @param minTallyApprovals The minimum number of approvals required for the tally to be considered valid.
/// @param minParticipation The minimum participation value. Its value has to be in the interval [0, 10^6] defined by `RATIO_BASE = 10**6`.
/// @param supportThreshold The support threshold value. Its value has to be in the interval [0, 10^6] defined by `RATIO_BASE = 10**6`.
/// @param minVoteDuration The minimum duration of the vote phase of a proposal.
/// @param minTallyDuration The minimum duration of the tally phase of a proposal.
/// @param daoTokenAddress The address of the DAO token.
/// @param minProposerVotingPower The minimum voting power required to create a proposal. Voting power is extracted from the DAO token
/// @param censusStrategyURI The URI containing he census strategy to be used in the proposals. See: https://github.com/vocdoni/census3
struct PluginSettings {
    bool onlyExecutionMultisigProposalCreation;
    uint16 minTallyApprovals;
    uint32 minParticipation;
    uint32 supportThreshold;
    uint64 minVoteDuration;
    uint64 minTallyDuration;
    address daoTokenAddress;
    uint256 minProposerVotingPower;
    string censusStrategyURI;
}
```

These parameters can be changed if the changer holds the `UPDATE_PLUGIN_SETTINGS_PERMISSION` permission.

The function to change them is:

```solidity
/// @notice Updates the plugin settings.
/// @param _pluginSettings The new plugin settings.
/// @dev The called must have the UPDATE_PLUGIN_SETTINGS_PERMISSION_ID permission.
function updatePluginSettings(PluginSettings memory _pluginSettings) public auth(UPDATE_PLUGIN_SETTINGS_PERMISSION_ID) { ... }
```

There is also the execution multisig list. This list can be modified if the changer holds the `UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION` permission.

The functions to modify the execution multisig members are:

```solidity
function addExecutionMultisigMembers(address[] calldata _members) external override auth(UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION_ID) { ... }

function removeExecutionMultisigMembers(address[] calldata _members) external override auth(UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION_ID) { ... }
```

It is expected that the plugin parameters and execution multisig members are controlled by the DAO and can be only changed by performing a vote. But it is up to the DAO creator to find the configuration that better acomodates its needs.

### Proposals and proposal creation

A proposal is defined as:

```solidity
/// @notice A container for proposal-related information.
/// @param executed Whether the proposal is executed or not.
/// @param vochainProposalId The ID of the proposal in the Vochain.
/// @param allowFailureMap A bitmap allowing the proposal to succeed, even if individual actions might revert. If the bit at index `i` is 1,
//         the proposal succeeds even if the i th action reverts. A failure map value of 0 requires every action to not revert.
/// @param parameters The parameters of the proposal.
/// @param tally The tally of the proposal.
/// @dev tally only supports [[Yes, No, Abstain]] schema in this order. i.e [[10, 5, 2]] means 10 Yes, 5 No, 2 Abstain.
/// @param approvers The approvers of the tally.
/// @param actions The actions to be executed when the proposal passes.
struct Proposal {
    bool executed;
    bytes32 vochainProposalId;
    uint256 allowFailureMap;
    ProposalParameters parameters;
    uint256[][] tally;
    address[] approvers;
    IDAO.Action[] actions;
}
```

An the proposal parameters are defined as:

```solidity
/// @notice A container for the proposal parameters.
/// @param securityBlock Block number used for limiting contract usage when plugin settings are updated
/// @param startDate The timestamp when the proposal starts.
/// @param voteEndDate The timestamp when the proposal ends. At this point the tally can be set.
/// @param tallyEndDate The timestamp when the proposal expires. Proposal can't be executed after.
/// @param totalVotingPower The total voting power of the proposal.
/// @param censusURI The URI of the census.
/// @param censusRoot The root of the census.
struct ProposalParameters {
    uint64 securityBlock;
    uint64 startDate;
    uint64 voteEndDate;
    uint64 tallyEndDate;
    uint256 totalVotingPower;
    string censusURI;
    string censusRoot;
}
```

When a proposal is created, the plugin will create a proposal in the Vocdoni blockchain and will store required proposal information on-chain.
First the proposal needs to be created on the Vocdoni blockchain so the plugin can get the proposal ID.

Depending on the configuration, the proposal can be created by any member of the DAO or only by the execution multisig members.

For creating a proposal the following function is used:

```solidity
/// @notice Internal function for creating a proposal.
/// @param _vochainProposalId The Vocdoni proposal ID.
/// @param _allowFailureMap The allow failure map of the proposal.
/// @param _parameters The parameters of the proposal.
/// @param _actions The actions of the proposal.
/// @return The ID of the created proposal.
function createProposal(
    bytes32 _vochainProposalId,
    uint256 _allowFailureMap,
    ProposalParameters memory _parameters,
    IDAO.Action[] memory _actions
) external returns (uint256) { ... }
```

The voting will happen on the Vocdoni blockchain.

### Set the tally

Once the voting process is finished, the execution multisig members can fetch the results from the Vocdoni blockchain and ensure that the results are valid.

If the results are valid, the execution multisig members can approve the tally and execute the proposal.

The tally can be set on-chain by the execution multisig members calling the following function:

```solidity
 function setTally(uint256 _proposalId, uint256[][] memory _tally) public override { ... }
```

### Approve the tally

Once the tally is set, other execution multisig members can approve the results in a multisig like way by calling:

```solidity
function approveTally(uint256 _proposalId, bool _tryExecution) public override { ... }
```

### Execute the proposal

If the tally is approved by the required number of execution multisig members, the proposal can be executed by anyone by calling:

```solidity
 function executeProposal(uint256 _proposalId) public override { ... }
```

## Setup

### Prerequisites

You need to have `node.js` and `yarn` installed.

### Installation

```shell
$ git clone https://github.com/vocdoni/aragon-osx-plugin.git
$ cd aragon-osx-plugin
$ yarn install
```

### Scripts

#### Test

`yarn test`

#### Build

`yarn build`

For NPM based build

`yarn build:npm`

#### Code coverage

`yarn coverage`

#### Code flattening

`yarn flatten`

#### Smart contract analysis

`yarn analyze`

#### Deployment

`yarn deploy`

#### Development

`yarn dev`

#### Generate documentation

`yarn docgen`

#### Code formatting

Check

`yarn formatting:check`

Write

`yarn formatting:write`

#### Clean

`yarn clean`

## License

[GNU Affero General Public License v3.0](./LICENSE)
