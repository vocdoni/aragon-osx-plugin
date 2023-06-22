// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.17;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";

/// @title IVocdoniVoting
/// @author Vocdoni
/// @notice The Vocdoni off-chain voting contract interface for the OSX plugin.
/// @notice The voting Proposal is managed off-chain on the Vocdoni blockchain.
interface IVocdoniVoting {
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