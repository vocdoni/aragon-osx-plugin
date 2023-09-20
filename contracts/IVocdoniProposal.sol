// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity ^0.8.17;

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";

/// @title IVocdoniProposal
/// @notice An interface to be implemented by DAO plugins that create and execute gasless proposals.
/// @dev Slighly modified from the original Aragon OSx IProposal interface.
interface IVocdoniProposal {
    /// @notice Emitted when a proposal is created.
    /// @param proposalId The ID of the proposal.
    /// @param vochainProposalId The ID of the proposal in the Vochain.
    /// @param creator  The creator of the proposal.
    /// @param startDate The start date of the proposal in seconds.
    /// @param endDate The end date of the proposal in seconds.
    /// @param expirationDate The expiration date of the proposal in seconds.
    /// @param actions The actions that will be executed if the proposal passes.
    /// @param allowFailureMap A bitmap allowing the proposal to succeed, even if individual actions might revert. If the bit at index `i` is 1, the proposal succeeds even if the `i`th action reverts. A failure map value of 0 requires every action to not revert.
    event ProposalCreated(
        uint256 indexed proposalId,
        bytes32 indexed vochainProposalId,
        address indexed creator,
        uint64 startDate,
        uint64 endDate,
        uint64 expirationDate,
        IDAO.Action[] actions,
        uint256 allowFailureMap
    );

    /// @notice Emitted when a proposal is executed.
    /// @param proposalId The ID of the proposal.
    event ProposalExecuted(uint256 indexed proposalId);

    /// @notice Returns the proposal count determining the next proposal ID.
    /// @return The proposal count.
    function proposalCount() external view returns (uint256);
}
