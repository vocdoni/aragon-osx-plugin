// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.17;

import {ERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {SafeCastUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";
import {Addresslist} from "@aragon/osx/plugins/utils/Addresslist.sol";

import {IExecutionMultisig} from "./IExecutionMultisig.sol";
import {VocdoniProposalUpgradeable} from "./VocdoniProposalUpgradeable.sol";

abstract contract ExecutionMultisig is
    IExecutionMultisig,
    Initializable,
    ERC165Upgradeable,
    PluginUUPSUpgradeable,
    Addresslist
{
    using SafeCastUpgradeable for uint256;

    /// @notice The ID of the permission required to add/remove executionMultisig members.
    bytes32 public constant UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION_ID =
        keccak256("UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION");

    /// @notice Keeps track at which block number the executionMultisig has been changed the last time.
    uint64 internal lastExecutionMultisigChange;

    /// @notice Initializes the component to be used by inheriting contracts.
    /// @dev This method is required to support [ERC-1822](https://eips.ethereum.org/EIPS/eip-1822).
    /// @param _dao The IDAO interface of the associated DAO.
    function __ExecutionMultisig_init(IDAO _dao) internal onlyInitializing {
        __PluginUUPSUpgradeable_init(_dao);
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(
        bytes4 _interfaceId
    ) public view virtual override(ERC165Upgradeable, PluginUUPSUpgradeable) returns (bool) {
        return
            _interfaceId == type(IExecutionMultisig).interfaceId ||
            _interfaceId == type(Addresslist).interfaceId ||
            super.supportsInterface(_interfaceId);
    }

    /// @inheritdoc IExecutionMultisig
    function addExecutionMultisigMembers(
        address[] calldata _members
    ) external override auth(UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION_ID) {
        _addExecutionMultisigMembers(_members);
    }

    /// @notice Private function for adding execution multisig members.
    /// @param _members The addresses to add.
    function _addExecutionMultisigMembers(address[] calldata _members) internal {
        _guardExecutionMultisig();
        if (_members.length == 0) {
            revert InvalidListLength({length: _members.length});
        }

        uint256 newAddresslistLength = addresslistLength() + _members.length;

        // Check if the new address list length would be greater than `type(uint16).max`, the maximal number of approvals.
        if (newAddresslistLength > type(uint16).max) {
            revert AddresslistLengthOutOfBounds({
                limit: type(uint16).max,
                actual: newAddresslistLength
            });
        }

        _addAddresses(_members);
        lastExecutionMultisigChange = uint64(block.number);

        emit ExecutionMultisigMembersAdded({newMembers: _members});
    }

    /// @inheritdoc IExecutionMultisig
    function removeExecutionMultisigMembers(address[] calldata _members) external virtual {}

    /// @inheritdoc IExecutionMultisig
    function isExecutionMultisigMember(address _member) public view override returns (bool) {
        return _isExecutionMultisigMember(_member);
    }

    /// @notice Internal function for checking whether an address is a executionMultisig member.
    /// @param _member The address to check.
    /// @return Whether the address is a executionMultisig member.
    function _isExecutionMultisigMember(address _member) internal view returns (bool) {
        return isListed(_member);
    }

    /// @notice Returns true if msg.sender has approved the given proposal tally
    /// @param _proposalId The ID of the proposal.
    /// @return Whether the msg.sender has approved the proposal tally.
    function hasApprovedTally(
        uint256 _proposalId,
        address _member
    ) external view virtual returns (bool);

    /// @notice Returns the block number of the last executionMultisig change.
    /// @return The block number of the last executionMultisig change.
    function getLastExecutionMultisigChange() external view returns (uint64) {
        return lastExecutionMultisigChange;
    }

    /// @notice Guard checks that processes key updates are not executed in the same block
    ///         where the executionMultisig changed.
    function _guardExecutionMultisig() internal view {
        if (lastExecutionMultisigChange == uint64(block.number)) {
            revert ExecutionMultisigUpdatedTooRecently({lastUpdate: lastExecutionMultisigChange});
        }
    }

    /// @notice This empty reserved space is put in place to allow future versions to add new variables without shifting down storage in the inheritance chain (see [OpenZeppelin's guide about storage gaps](https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps)).
    uint256[49] private __gap;
}
