// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.17;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";

/// @title IVocdoniVoting
/// @author Vocdoni
/// @notice The Vocdoni off-chain voting contract interface for the OSX plugin.
/// @notice The voting Proposal is managed off-chain on the Vocdoni blockchain.
interface IVocdoniVoting {
    /// @notice Emitted when one or more committee members are added.
    /// @param newMembers The addresses of the new committee members.
    event CommitteeMembersAdded(address[] indexed newMembers);

    /// @notice Emitted when one or more committee member are removed.
    /// @param removedMembers The addresses of the removed committee members.
    event CommitteeMembersRemoved(address[] indexed removedMembers);

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

    /// @notice Thrown if the minimal duration value is out of bounds (less than one hour or greater than 1 year).
    /// @param limit The limit value.
    /// @param actual The actual value.
    error MinDurationOutOfBounds(uint64 limit, uint64 actual);

    /// @notice Trown if the maximum proposal expiration time is out of bounds (more than 1 year).
    /// @param limit The limit value.
    /// @param actual The actual value.
    error ExpirationTimeOutOfBounds(uint64 limit, uint64 actual);

    /// @notice Thrown if the start date is invalid.
    /// @param limit The limit value.
    /// @param actual The actual value.
    error InvalidStartDate(uint64 limit, uint64 actual);

    /// @notice Thrown if the end date is invalid.
    /// @param limit The limit value.
    /// @param actual The actual value.
    error InvalidEndDate(uint64 limit, uint64 actual);

    /// @notice Thrown if the expiration date is invalid.
    /// @param limit The expiration date.
    /// @param actual The actual value.
    error InvalidExpirationDate(uint64 limit, uint64 actual);

    /// @notice Thrown if the plugin settings are updated too recently.
    /// @param lastUpdate The block number of the last update.
    error PluginSettingsUpdatedTooRecently(uint64 lastUpdate);

    /// @notice Thrown if the committee is updated too recently.
    /// @param lastUpdate The block number of the last update.
    error CommitteeUpdatedTooRecently(uint64 lastUpdate);

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

    /// @notice Thrown if the proposal tally is not approved by enough committee members.
    /// @param minApprovals The minimum number of approvals required.
    /// @param actualApprovals The actual number of approvals.
    error NotEnoughApprovals(uint16 minApprovals, uint16 actualApprovals);

    /// @notice Thrown if an address is not valid or not supported
    /// @param addr The address
    error InvalidAddress(address addr);

    /// @notice Thrown if the prosal is not in the tally phase
    /// @param startDate The start date of the proposal
    /// @param endDate The end date of the proposal
    /// @param expirationDate The expiration date of the proposal
    /// @param currentTimestamp The current timestamp
    error ProposalNotInTallyPhase(uint64 startDate, uint64 endDate, uint64 expirationDate, uint256 currentTimestamp);

    /// @notice Thrown if the msg.sender does not have enough voting power
    /// @param required The required voting power
    error NotEnoughVotingPower(uint256 required);

    /// @notice Thrown if the msg.sender is not a committee member
    /// @param sender The sender
    error OnlyCommittee(address sender);

    /// @notice Thrown if the support threshold is not reached
    /// @param currentSupport The current support
    /// @param supportThreshold The support threshold
    error SupportThresholdNotReached(uint256 currentSupport, uint32 supportThreshold);

    /// @notice Thrown if the minimum participation is not reached
    /// @param currentParticipation The current participation
    /// @param minParticipation The minimum participation
    error MinParticipationNotReached(uint256 currentParticipation,uint32 minParticipation);

    /// @notice Adds new committee members.
    /// @param _members The addresses of the new committee members.
    function addCommitteeMembers(address[] calldata _members) external;

    /// @notice Removes committee members.
    /// @param _members The addresses of the committee members to remove.
    function removeCommitteeMembers(address[] calldata _members) external;

    /// @notice Returns whether an address is a committee member.
    /// @param _member The address to check.
    /// @return Whether the address is a committee member.
    function isCommitteeMember(address _member) external view returns (bool);

    /// @notice Sets the tally of a given proposal.
    /// @param _proposalId The ID of the proposal to set the tally of.
    /// @param _tally The tally to set.
    function setTally(uint256 _proposalId, uint256[][] memory _tally) external;

    /// @notice Approves a proposal tally.
    /// @param _proposalId The ID of the proposal to approve.
    function approveTally(uint256 _proposalId, bool _tryExecution) external;

    /// @notice Executes a proposal.
    /// @param _proposalId The ID of the proposal to execute.
    function executeProposal(uint256 _proposalId) external;
}