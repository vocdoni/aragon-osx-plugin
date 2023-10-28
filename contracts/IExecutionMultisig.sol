// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.17;

interface IExecutionMultisig {
    
    /// @notice Emitted when one or more execution multisig members are added.
    /// @param newMembers The addresses of the new execution multisig members.
    event ExecutionMultisigMembersAdded(address[] indexed newMembers);

    /// @notice Emitted when one or more execution multisig member are removed.
    /// @param removedMembers The addresses of the removed execution multisig members.
    event ExecutionMultisigMembersRemoved(address[] indexed removedMembers);

    /// @notice Thrown if the address list length is out of bounds.
    /// @param limit The limit value.
    /// @param actual The actual value.
    error AddresslistLengthOutOfBounds(uint16 limit, uint256 actual);

    /// @notice Thrown if invalid list length
    /// @param length The actual length
    error InvalidListLength(uint256 length);

    /// @notice Thrown if the minimal approvals value is out of bounds (less than 1 or greater than the number of members in the address list).
    /// @param limit The maximal value.
    /// @param actual The actual value.
    error MinApprovalsOutOfBounds(uint16 limit, uint16 actual);

    /// @notice Thrown if the execution multisig is updated too recently.
    /// @param lastUpdate The block number of the last update.
    error ExecutionMultisigUpdatedTooRecently(uint64 lastUpdate);

    /// @notice Adds members to the execution multisig.
    /// @param _members The addresses to add.
    function addExecutionMultisigMembers(address[] calldata _members) external;

    /// @notice Removes members from the execution multisig.
    /// @param _members The addresses to remove.
    function removeExecutionMultisigMembers(address[] calldata _members) external;

    /// @notice Checks if an address is a member of the execution multisig.
    /// @param _member The address to check.
    /// @return Whether the address is a member of the execution multisig.
    function isExecutionMultisigMember(address _member) external view returns (bool);

    /// @notice Returns the block number of the last executionMultisig change.
    /// @return The block number of the last executionMultisig change.
    function getLastExecutionMultisigChange() external view returns (uint64);
}