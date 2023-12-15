// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import {CountersUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import {ERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import {IVocdoniProposal} from "./IVocdoniProposal.sol";
import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";

/// @title VocdoniProposalUpgradeable
/// @notice An abstract contract containing the traits and internal functionality to create and execute gasless proposals that can be inherited by upgradeable DAO plugins.
/// @dev Slighly modified from the original Aragon OSx ProposalUpgradeable contract.
abstract contract VocdoniProposalUpgradeable is IVocdoniProposal, ERC165Upgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;

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
        bytes32 censusRoot;
    }

    /// @notice A container for proposal-related information.
    /// @param executed Whether the proposal is executed or not.
    /// @param vochainProposalId The ID of the proposal in the Vochain.
    /// @param allowFailureMap A bitmap allowing the proposal to succeed, even if individual actions might revert. If the bit at index `i` is 1,
    //         the proposal succeeds even if the nth action reverts. A failure map value of 0 requires every action to not revert.
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

    /// @notice The incremental ID for proposals and executions.
    CountersUpgradeable.Counter private proposalCounter;

    /// @inheritdoc IVocdoniProposal
    function proposalCount() public view override returns (uint256) {
        return proposalCounter.current();
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(bytes4 _interfaceId) public view virtual override returns (bool) {
        return
            _interfaceId == type(IVocdoniProposal).interfaceId ||
            super.supportsInterface(_interfaceId);
    }

    /// @notice Creates a proposal ID.
    /// @return proposalId The proposal ID.
    function _createProposalId() internal returns (uint256 proposalId) {
        proposalId = proposalCount();
        proposalCounter.increment();
    }

    /// @notice Internal function to execute a proposal.
    /// @param _proposalId The ID of the proposal to be executed.
    /// @param _actions The array of actions to be executed.
    /// @param _allowFailureMap A bitmap allowing the proposal to succeed, even if individual actions might revert. If the bit at index `i` is 1, the proposal succeeds even if the `i`th action reverts. A failure map value of 0 requires every action to not revert.
    /// @return execResults The array with the results of the executed actions.
    /// @return failureMap The failure map encoding which actions have failed.
    function _executeProposal(
        IDAO _dao,
        uint256 _proposalId,
        IDAO.Action[] memory _actions,
        uint256 _allowFailureMap
    ) internal virtual returns (bytes[] memory execResults, uint256 failureMap) {
        (execResults, failureMap) = _dao.execute(bytes32(_proposalId), _actions, _allowFailureMap);
        emit ProposalExecuted({proposalId: _proposalId});
    }

    /// @notice This empty reserved space is put in place to allow future versions to add new variables without shifting down storage in the inheritance chain (see [OpenZeppelin's guide about storage gaps](https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps)).
    uint256[49] private __gap;
}
