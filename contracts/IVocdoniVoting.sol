// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.17;

/// @title IVocdoniVoting
/// @author Vocdoni
/// @notice The Vocdoni gasless voting contract interface for the OSX plugin.
/// @notice The voting Proposal is managed gasless on the Vocdoni blockchain.
interface IVocdoniVoting {
    /// @notice Emitted when one or more execution multisig members are added.
    /// @param newMembers The addresses of the new execution multisig members.
    event ExecutionMultisigMembersAdded(address[] indexed newMembers);

    /// @notice Emitted when one or more execution multisig member are removed.
    /// @param removedMembers The addresses of the removed execution multisig members.
    event ExecutionMultisigMembersRemoved(address[] indexed removedMembers);

    /// @notice Emitted when the tally of a proposal is set.
    /// @param proposalId The ID of the proposal.
    /// @param tally The tally.
    event TallySet(uint256 indexed proposalId, uint256[][] tally);

    /// @notice Emitted when the tally of a proposal is approved by a member.
    /// @param proposalId The ID of the proposal.
    event TallyApproval(uint256 indexed proposalId, address indexed approver);

    /// @notice Thrown if the address list length is out of bounds.
    /// @param limit The limit value.
    /// @param actual The actual value.
    error AddresslistLengthOutOfBounds(uint16 limit, uint256 actual);

    /// @notice Thrown if the minimal approvals value is out of bounds (less than 1 or greater than the number of members in the address list).
    /// @param limit The maximal value.
    /// @param actual The actual value.
    error MinApprovalsOutOfBounds(uint16 limit, uint16 actual);

    /// @notice Thrown if the vote phase duration is out of bounds (more than 1 year or less than 1 hour).
    /// @param limit The limit value.
    /// @param actual The actual value.
    error VoteDurationOutOfBounds(uint64 limit, uint64 actual);

    /// @notice Trown if the tally phase duration is out of bounds (more than 1 year or less than 1 hour).
    /// @param limit The limit value.
    /// @param actual The actual value.
    error TallyDurationOutOfBounds(uint64 limit, uint64 actual);

    /// @notice Thrown if the start date is invalid.
    /// @param limit The limit value.
    /// @param actual The actual value.
    error InvalidStartDate(uint64 limit, uint64 actual);

    /// @notice Thrown if the end date is invalid.
    /// @param limit The limit value.
    /// @param actual The actual value.
    error InvalidVoteEndDate(uint64 limit, uint64 actual);

    /// @notice Thrown if the tally end date is invalid.
    /// @param limit The tally end date.
    /// @param actual The actual value.
    error InvalidTallyEndDate(uint64 limit, uint64 actual);

    /// @notice Thrown if the plugin settings are updated too recently.
    /// @param lastUpdate The block number of the last update.
    error PluginSettingsUpdatedTooRecently(uint64 lastUpdate);

    /// @notice Thrown if the execution multisig is updated too recently.
    /// @param lastUpdate The block number of the last update.
    error ExecutionMultisigUpdatedTooRecently(uint64 lastUpdate);

    /// @notice Thrown if the proposal is already executed.
    /// @param proposalId The ID of the proposal.
    error ProposalAlreadyExecuted(uint256 proposalId);

    /// @notice Thrown if the proposal tally is invalid.
    /// @param tally The tally of the proposal.
    error InvalidTally(uint256[][] tally);

    /// @notice Thrown if the proposal tally is already set and approved.
    /// @param approvals The number of approvals.
    /// @param minApprovals The minimum number of approvals required.
    error TallyAlreadyApproved(uint256 approvals, uint16 minApprovals);

    /// @notice Thrown is the tally is already approved by the sender.
    /// @param sender The sender.
    error TallyAlreadyApprovedBySender(address sender);

    /// @notice Thrown if the proposal tally is not approved by enough execution multisig members.
    /// @param minApprovals The minimum number of approvals required.
    /// @param actualApprovals The actual number of approvals.
    error NotEnoughApprovals(uint16 minApprovals, uint16 actualApprovals);

    /// @notice Thrown if an address is not valid or not supported
    /// @param addr The address
    error InvalidAddress(address addr);

    /// @notice Thrown if the proposal is not in the tally phase
    /// @param voteEndDate The end date of the proposal
    /// @param tallyEndDate The tally end date of the proposal
    /// @param currentTimestamp The current timestamp
    error ProposalNotInTallyPhase(
        uint64 voteEndDate,
        uint64 tallyEndDate,
        uint256 currentTimestamp
    );

    /// @notice Thrown if the msg.sender does not have enough voting power
    /// @param required The required voting power
    error NotEnoughVotingPower(uint256 required);

    /// @notice Thrown if the msg.sender is not a execution multisig member
    /// @param sender The sender
    error OnlyExecutionMultisig(address sender);

    /// @notice Thrown if the support threshold is not reached
    /// @param currentSupport The current support
    /// @param supportThreshold The support threshold
    error SupportThresholdNotReached(uint256 currentSupport, uint32 supportThreshold);

    /// @notice Thrown if the minimum participation is not reached
    /// @param currentVotingPower The current voting power
    /// @param minVotingPower The minimum voting power to reach
    error MinParticipationNotReached(uint256 currentVotingPower, uint256 minVotingPower);

    /// @notice Thrown if the total voting power is invalid
    /// @param totalVotingPower The total voting power
    error InvalidTotalVotingPower(uint256 totalVotingPower);

    /// @notice Thrown if invalid list length
    /// @param length The actual length
    error InvalidListLength(uint256 length);

    /// @notice Adds new execution multisig members.
    /// @param _members The addresses of the new execution multisig members.
    function addExecutionMultisigMembers(address[] calldata _members) external;

    /// @notice Removes execution multisig members.
    /// @param _members The addresses of the execution multisig members to remove.
    function removeExecutionMultisigMembers(address[] calldata _members) external;

    /// @notice Returns whether an address is a execution ultisig member.
    /// @param _member The address to check.
    /// @return Whether the address is a execution multisig member.
    function isExecutionMultisigMember(address _member) external view returns (bool);

    /// @notice Sets the tally of a given proposal.
    /// @param _proposalId The ID of the proposal to set the tally of.
    /// @param _tally The tally to set.
    function setTally(uint256 _proposalId, uint256[][] memory _tally) external;

    /// @notice Approves a proposal tally.
    /// @param _proposalId The ID of the proposal to approve.
    /// @param _tryExecution Whether to try to execute the proposal if the tally is approved.
    function approveTally(uint256 _proposalId, bool _tryExecution) external;

    /// @notice Executes a proposal.
    /// @param _proposalId The ID of the proposal to execute.
    function executeProposal(uint256 _proposalId) external;
}
