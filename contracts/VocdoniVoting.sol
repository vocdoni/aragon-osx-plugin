// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.17;

import {SafeCastUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import {IDAO} from "@aragon/osx/core/dao/IDAO.sol";
import {PluginUUPSUpgradeable} from "@aragon/osx/core/plugin/PluginUUPSUpgradeable.sol";
import {RATIO_BASE, _applyRatioCeiled, RatioOutOfBounds} from "@aragon/osx/plugins/utils/Ratio.sol";

import {VocdoniProposalUpgradeable} from "./VocdoniProposalUpgradeable.sol";
import {IVocdoniVoting} from "./IVocdoniVoting.sol";
import {ExecutionMultisig} from "./ExecutionMultisig.sol";

/// @title VocdoniVoting
/// @author Vocdoni
/// @notice The Vocdoni gasless voting data contract for the OSX plugin.
/// @notice The voting Proposal is managed gasless on the Vocdoni blockchain.
contract VocdoniVoting is
    IVocdoniVoting,
    PluginUUPSUpgradeable,
    ExecutionMultisig
{
    using SafeCastUpgradeable for uint256;

    /// @notice The [ERC-165](https://eips.ethereum.org/EIPS/eip-165) interface ID of the contract.
    bytes4 internal constant VOCDONI_INTERFACE_ID =
        this.initialize.selector ^ this.createProposal.selector;

    /// @notice The ID of the permission required to update the plugin settings.
    bytes32 public constant UPDATE_PLUGIN_SETTINGS_PERMISSION_ID =
        keccak256("UPDATE_PLUGIN_SETTINGS_PERMISSION");

    /// @notice Emitted when the plugin settings are updated.
    /// @param onlyExecutionMultisigProposalCreation If true, only executionMultisig members can create proposals.
    /// @param minTallyApprovals The minimum number of approvals required for a tally to be considered accepted.
    /// @param minParticipation The minimum participation value. Its value has to be in the interval [0, 10^6] defined by `RATIO_BASE = 10**6`.
    /// @param supportThreshold The support threshold value. Its value has to be in the interval [0, 10^6] defined by `RATIO_BASE = 10**6`.
    /// @param minVoteDuration The minimum duration of the vote phase of a proposal.
    /// @param minTallyDuration The minimum duration of the tally phase of a proposal.
    /// @param daoTokenAddress The address of the DAO token.
    /// @param censusStrategyURI The URI containing the predicate of the census strategy to be used in the proposals. See: https://github.com/vocdoni/census3
    /// @param minProposerVotingPower The minimum voting power required to create a proposal. Voting power is extracted from the DAO token
    event PluginSettingsUpdated(
        bool onlyExecutionMultisigProposalCreation,
        uint16 indexed minTallyApprovals,
        uint32 minParticipation,
        uint32 supportThreshold,
        uint64 minVoteDuration,
        uint64 minTallyDuration,
        address indexed daoTokenAddress,
        string indexed censusStrategyURI,
        uint256 minProposerVotingPower
    );

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

    /// @notice Keeps track at which block number the plugin settings have been changed the last time.
    uint64 private lastPluginSettingsChange;

    /// @notice A mapping between proposal IDs and proposal information.
    mapping(uint256 => Proposal) private proposals;

    /// @notice The current plugin settings.
    PluginSettings private pluginSettings;

    /// @notice Initializes the plugin.
    /// @param _dao The DAO address.
    /// @param _executionMultisigAddresses The addresses of the executionMultisig.
    /// @param _pluginSettings The initial plugin settings.
    function initialize(
        IDAO _dao,
        address[] calldata _executionMultisigAddresses,
        PluginSettings memory _pluginSettings
    ) external initializer {
        __ExecutionMultisig_init(_dao);
        _addExecutionMultisigMembers(_executionMultisigAddresses);
        _updatePluginSettings(_pluginSettings);
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param _interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(
        bytes4 _interfaceId
    )
        public
        view
        virtual
        override(PluginUUPSUpgradeable, ExecutionMultisig)
        returns (bool)
    {
        return
            _interfaceId == VOCDONI_INTERFACE_ID ||
            _interfaceId == type(IVocdoniVoting).interfaceId ||
            super.supportsInterface(_interfaceId);
    }

    /// @inheritdoc ExecutionMultisig
    /// @dev Overriden where for having access to minTallyApprovals
    function removeExecutionMultisigMembers(
        address[] calldata _members
    ) external override auth(UPDATE_PLUGIN_EXECUTION_MULTISIG_PERMISSION_ID) {
        _removeExecutionMultisigMember(_members);
    }

    /// @notice Private function for removing execution multisig members.
    /// @param _members The addresses to remove.
    function _removeExecutionMultisigMember(address[] calldata _members) private {
        _guardExecutionMultisig();
        if (_members.length == 0) {
            revert InvalidListLength({length: _members.length});
        }

        uint16 newAddresslistLength = uint16(addresslistLength() - _members.length);

        // Check if the new address list length would become less than the current minimum number of approvals required.
        if (newAddresslistLength < pluginSettings.minTallyApprovals) {
            revert MinApprovalsOutOfBounds({
                limit: newAddresslistLength,
                actual: pluginSettings.minTallyApprovals
            });
        }

        _removeAddresses(_members);
        lastExecutionMultisigChange = uint64(block.number);

        emit ExecutionMultisigMembersRemoved({removedMembers: _members});
    }

    /// @inheritdoc ExecutionMultisig
    function hasApprovedTally(uint256 _proposalId, address _member) external view override returns (bool) {
        return _hasApprovedTally(proposals[_proposalId], _member);
    }

    /// @notice Internal function for checking if a member has approved a proposal tally.
    /// @param _proposal The proposal to check.
    /// @param _member The member to check.
    /// @return Whether the member has approved the proposal tally.
    function _hasApprovedTally(
        Proposal memory _proposal,
        address _member
    ) internal pure returns (bool) {
        for (uint256 i = 0; i < _proposal.approvers.length;) {
            if (_proposal.approvers[i] == _member) {
                return true;
            }
            unchecked {
                i++;
            }
        }
        return false;
    }

    /// @notice Updates the plugin settings.
    /// @param _pluginSettings The new plugin settings.
    /// @dev The called must have the UPDATE_PLUGIN_SETTINGS_PERMISSION_ID permission.
    function updatePluginSettings(
        PluginSettings memory _pluginSettings
    ) external auth(UPDATE_PLUGIN_SETTINGS_PERMISSION_ID) {
        _updatePluginSettings(_pluginSettings);
    }

    /// @notice Internal function for updating the plugin settings.
    /// @param _pluginSettings The new plugin settings.
    function _updatePluginSettings(PluginSettings memory _pluginSettings) private {
        _guardPluginSettings();

        if (_pluginSettings.supportThreshold > RATIO_BASE - 1) {
            revert RatioOutOfBounds({
                limit: RATIO_BASE - 1,
                actual: _pluginSettings.supportThreshold
            });
        }

        // Require the minimum participation value to be in the interval [0, 10^6], because `>=` comparision is used in the participation criterion.
        if (_pluginSettings.minParticipation > RATIO_BASE) {
            revert RatioOutOfBounds({limit: RATIO_BASE, actual: _pluginSettings.minParticipation});
        }

        if (_pluginSettings.minVoteDuration > 365 days) {
            revert VoteDurationOutOfBounds({
                limit: 365 days,
                actual: _pluginSettings.minVoteDuration
            });
        }

        if (_pluginSettings.minVoteDuration < 60 minutes) {
            revert VoteDurationOutOfBounds({
                limit: 60 minutes,
                actual: _pluginSettings.minVoteDuration
            });
        }

        if (_pluginSettings.minTallyDuration > 365 days) {
            revert TallyDurationOutOfBounds({
                limit: 365 days,
                actual: _pluginSettings.minTallyDuration
            });
        }

        if (_pluginSettings.minTallyDuration < 60 minutes) {
            revert TallyDurationOutOfBounds({
                limit: 60 minutes,
                actual: _pluginSettings.minTallyDuration
            });
        }

        // update plugin settings
        pluginSettings = _pluginSettings;
        lastPluginSettingsChange = uint64(block.number);

        emit PluginSettingsUpdated({
            onlyExecutionMultisigProposalCreation: _pluginSettings
                .onlyExecutionMultisigProposalCreation,
            minTallyApprovals: _pluginSettings.minTallyApprovals,
            minVoteDuration: _pluginSettings.minVoteDuration,
            minTallyDuration: _pluginSettings.minTallyDuration,
            minParticipation: _pluginSettings.minParticipation,
            supportThreshold: _pluginSettings.supportThreshold,
            daoTokenAddress: _pluginSettings.daoTokenAddress,
            censusStrategyURI: _pluginSettings.censusStrategyURI,
            minProposerVotingPower: _pluginSettings.minProposerVotingPower
        });
    }

    /// @notice Returns a proposal.
    /// @param _proposalId The ID of the proposal to return.
    /// @return executed Whether the proposal is executed or not.
    /// @return approvers The approvers of the tally.
    /// @return vochainProposalId The ID of the proposal in the Vochain.
    /// @return parameters The parameters of the proposal.
    /// @return allowFailureMap The allow failure map of the proposal.
    /// @return tally The tally of the proposal.
    /// @return actions The actions of the proposal.
    function getProposal(
        uint256 _proposalId
    )
        public
        view
        returns (
            bool executed,
            address[] memory approvers,
            bytes32 vochainProposalId,
            ProposalParameters memory parameters,
            uint256 allowFailureMap,
            uint256[][] memory tally,
            IDAO.Action[] memory actions
        )
    {
        Proposal memory proposal = proposals[_proposalId];
        executed = proposal.executed;
        approvers = proposal.approvers;
        vochainProposalId = proposal.vochainProposalId;
        parameters = proposal.parameters;
        allowFailureMap = proposal.allowFailureMap;
        tally = proposal.tally;
        actions = proposal.actions;
    }

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
    ) external returns (uint256) {
        _guardExecutionMultisig();
        _guardPluginSettings();

        PluginSettings memory _pluginSettings = pluginSettings;
        address sender = _msgSender();

        if (
            _pluginSettings.onlyExecutionMultisigProposalCreation &&
            !_isExecutionMultisigMember(sender)
        ) {
            revert OnlyExecutionMultisig({sender: sender});
        }

        if (_pluginSettings.minProposerVotingPower != 0) {
            // Because of the checks in `VocdoniVotingSetup`, we can assume that `votingToken` is an [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token.
            uint256 votes = IVotesUpgradeable(_pluginSettings.daoTokenAddress).getVotes(sender);
            uint256 balance = IERC20Upgradeable(_pluginSettings.daoTokenAddress).balanceOf(sender);

            if (
                votes < _pluginSettings.minProposerVotingPower &&
                balance < _pluginSettings.minProposerVotingPower
            ) {
                revert NotEnoughVotingPower({required: _pluginSettings.minProposerVotingPower});
            }
        }

        (
            _parameters.startDate,
            _parameters.voteEndDate,
            _parameters.tallyEndDate
        ) = _validateProposalDates(
            _parameters.startDate,
            _parameters.voteEndDate,
            _parameters.tallyEndDate
        );

        if (_parameters.totalVotingPower == 0) {
            revert InvalidTotalVotingPower({totalVotingPower: _parameters.totalVotingPower});
        }

        uint256 _proposalId = _createProposalId();
        Proposal storage proposal = proposals[_proposalId];

        proposal.vochainProposalId = _vochainProposalId;
        proposal.parameters.startDate = _parameters.startDate;
        proposal.parameters.voteEndDate = _parameters.voteEndDate;
        proposal.parameters.tallyEndDate = _parameters.tallyEndDate;
        proposal.parameters.totalVotingPower = _parameters.totalVotingPower;
        proposal.parameters.censusURI = _parameters.censusURI;
        proposal.parameters.censusRoot = _parameters.censusRoot;
        proposal.parameters.securityBlock = block.number.toUint64();
        proposal.allowFailureMap = _allowFailureMap;
        for (uint256 i = 0; i < _actions.length; ) {
            proposal.actions.push(_actions[i]);
            unchecked {
                i++;
            }
        }

        emit ProposalCreated(
            _proposalId,
            _vochainProposalId,
            sender,
            _parameters.startDate,
            _parameters.voteEndDate,
            _parameters.tallyEndDate,
            _actions,
            _allowFailureMap
        );

        return _proposalId;
    }

    /// @inheritdoc IVocdoniVoting
    function setTally(uint256 _proposalId, uint256[][] memory _tally) public override {
        _setTally(_proposalId, _tally);
    }

    /// @notice Internal function for setting the tally of a given proposal.
    /// @param _proposalId The ID of the proposal to set the tally of.
    /// @param _tally The tally to set.
    /// @dev The caller must be a executionMultisig member.
    function _setTally(uint256 _proposalId, uint256[][] memory _tally) internal {
        _guardExecutionMultisig();
        _guardPluginSettings();
        address sender = _msgSender();

        if (!_isExecutionMultisigMember(sender)) {
            revert OnlyExecutionMultisig({sender: sender});
        }

        Proposal storage proposal = proposals[_proposalId];

        if (proposal.executed) {
            revert ProposalAlreadyExecuted({proposalId: _proposalId});
        }

        if (!_isProposalOnTallyPhase(proposal)) {
            revert ProposalNotInTallyPhase({
                voteEndDate: proposal.parameters.voteEndDate,
                tallyEndDate: proposal.parameters.tallyEndDate,
                currentTimestamp: block.timestamp
            });
        }

        // only supported tally is [[Yes, No, Abstain]]
        if (_tally.length != 1 || _tally[0].length != 3) {
            revert InvalidTally({tally: _tally});
        }

        // tally already set
        if (proposal.tally.length != 0) {
            // check proposal not already approved
            if (proposal.approvers.length >= pluginSettings.minTallyApprovals) {
                revert TallyAlreadyApproved({
                    approvals: proposal.approvers.length,
                    minApprovals: pluginSettings.minTallyApprovals
                });
            }
            // check if the new tally is different
            if (
                _tally[0][0] == proposal.tally[0][0] &&
                _tally[0][1] == proposal.tally[0][1] &&
                _tally[0][2] == proposal.tally[0][2]
            ) {
                revert InvalidTally({tally: _tally});
            }
            // reset approvers
            delete proposal.approvers;
        }

        proposal.tally = _tally;
        proposal.approvers.push(sender);

        emit TallySet({proposalId: _proposalId, tally: _tally});
        emit TallyApproval({proposalId: _proposalId, approver: sender});
    }

    /// @inheritdoc IVocdoniVoting
    function approveTally(uint256 _proposalId, bool _tryExecution) external override {
        return _approveTally(_proposalId, _tryExecution);
    }

    /// @notice Internal function for approving a proposal tally.
    /// @param _proposalId The ID of the proposal to approve.
    /// @param _tryExecution Whether to try to execute the proposal after approving the tally.
    function _approveTally(uint256 _proposalId, bool _tryExecution) internal {
        _guardExecutionMultisig();
        _guardPluginSettings();

        address sender = _msgSender();

        if (!_isExecutionMultisigMember(sender)) {
            revert OnlyExecutionMultisig({sender: sender});
        }

        Proposal storage proposal = proposals[_proposalId];

        // also checks that proposal is in tally phase, as the tally cannot be set otherwise
        if (proposal.tally.length == 0) {
            revert InvalidTally(proposal.tally);
        }

        if (_hasApprovedTally(proposal, sender)) {
            revert TallyAlreadyApprovedBySender({sender: sender});
        }

        if (proposal.approvers.length >= pluginSettings.minTallyApprovals) {
            revert TallyAlreadyApproved({
                approvals: proposal.approvers.length,
                minApprovals: pluginSettings.minTallyApprovals
            });
        }

        // if executionMultisig changed since proposal creation, the proposal approvals of the previous executionMultisig members are not valid
        if (proposal.parameters.securityBlock < lastExecutionMultisigChange) {
            address[] memory newApprovers = new address[](0);
            // newApprovers are the oldApprovers list without the non executionMultisig members at the current block
            uint8 newApproversCount = 0;
            for (uint256 i = 0; i < proposal.approvers.length; ) {
                address oldApprover = proposal.approvers[i];
                if (
                    _isExecutionMultisigMember(oldApprover) &&
                    _hasApprovedTally(proposal, oldApprover)
                ) {
                    newApprovers[newApproversCount] = oldApprover;
                    unchecked {
                        newApproversCount++;
                    }
                }
                unchecked {
                    i++;
                }
            }
            proposal.approvers = newApprovers;
            proposal.parameters.securityBlock = lastExecutionMultisigChange;
        }

        proposal.approvers.push(sender);

        emit TallyApproval({proposalId: _proposalId, approver: sender});

        if (_tryExecution) {
            _checkTallyAndExecute(_proposalId);
        }
    }

    /// @inheritdoc IVocdoniVoting
    function executeProposal(uint256 _proposalId) public override {
        _guardExecutionMultisig();
        _guardPluginSettings();

        _checkTallyAndExecute(_proposalId);
    }

    /// @notice Internal function to check if a proposal is on the tally phase.
    /// @param _proposal The proposal to check
    function _isProposalOnTallyPhase(Proposal memory _proposal) internal view returns (bool) {
        uint64 currentBlockTimestamp = uint64(block.timestamp);
        /// [... startDate ............ voteEndDate ............ tallyEndDate ...]
        /// [............. Voting phase ............ Tally phase ................]
        if (
            _proposal.parameters.startDate < currentBlockTimestamp &&
            _proposal.parameters.voteEndDate < currentBlockTimestamp - 1 &&
            _proposal.parameters.tallyEndDate > currentBlockTimestamp
        ) {
            return true;
        }
        return false;
    }

    /// @notice Internal function to check the tally and execute a proposal if:
    ///          - The support threshold is reached
    ///          - The minimum participation is reached.
    ///          - Enough execution multisig members have approved the tally.
    ///          - Proposal is not already executed.
    ///          - The tally is valid.
    ///          - The proposal is in the tally phase.
    /// @param _proposalId The ID of the proposal to check.
    function _checkTallyAndExecute(uint256 _proposalId) internal {
        Proposal memory proposal = proposals[_proposalId];

        if (proposal.executed) {
            revert ProposalAlreadyExecuted({proposalId: _proposalId});
        }

        // also checks that proposal is in tally phase, as the tally cannot be set otherwise
        if (proposal.tally.length == 0) {
            revert InvalidTally({tally: proposal.tally});
        }

        if (proposal.parameters.tallyEndDate < block.timestamp) {
            revert ProposalNotInTallyPhase({
                voteEndDate: proposal.parameters.voteEndDate,
                tallyEndDate: proposal.parameters.tallyEndDate,
                currentTimestamp: block.timestamp
            });
        }

        if (proposal.approvers.length < pluginSettings.minTallyApprovals) {
            revert NotEnoughApprovals({
                minApprovals: pluginSettings.minTallyApprovals,
                actualApprovals: proposal.approvers.length.toUint16()
            });
        }

        uint256 currentVotingPower = proposal.tally[0][0] +
            proposal.tally[0][1] +
            proposal.tally[0][2];

        uint256 minVotingPower = _applyRatioCeiled(
            proposal.parameters.totalVotingPower,
            pluginSettings.minParticipation
        );

        if (minVotingPower > currentVotingPower) {
            revert MinParticipationNotReached({
                currentVotingPower: currentVotingPower,
                minVotingPower: minVotingPower
            });
        }

        uint256 yesRatioPart = (RATIO_BASE - pluginSettings.supportThreshold) *
            proposal.tally[0][0];
        uint256 noRatioPart = pluginSettings.supportThreshold * proposal.tally[0][1];
        if (yesRatioPart <= noRatioPart) {
            revert SupportThresholdNotReached({
                currentSupport: _getCurrentSupport(proposal.tally),
                supportThreshold: pluginSettings.supportThreshold
            });
        }

        proposals[_proposalId].executed = true;
        _executeProposal(dao(), _proposalId, proposal.actions, proposal.allowFailureMap);
    }

    /// @notice Internal function calculating the current support of a proposal
    /// @param _tally The tally of the proposal.
    /// @return The current support of the proposal.
    function _getCurrentSupport(uint256[][] memory _tally) internal pure returns (uint256) {
        return (_tally[0][0] * RATIO_BASE) / (_tally[0][0] + _tally[0][1]);
    }

    /// @notice Internal function for validating the proposal dates.
    ///         If the start date is 0, it is set to the current block timestamp.
    ///         If the end vote date is 0, it is set to the start date + min vote duration.
    ///         If the tally end date is 0, it is set to the end date + min tally duration.
    /// @param _startDate The start date of the proposal.
    /// @param _voteEndDate The vote end date of the proposal.
    /// @param _tallyEndDate The tally end date of the proposal.
    /// @return startDate The validated start date.
    /// @return voteEndDate The validated vote end date.
    /// @return tallyEndDate The validated tally end date.
    function _validateProposalDates(
        uint64 _startDate,
        uint64 _voteEndDate,
        uint64 _tallyEndDate
    ) internal view returns (uint64 startDate, uint64 voteEndDate, uint64 tallyEndDate) {
        uint64 currentBlockTimestamp = block.timestamp.toUint64();
        // check proposal start date and set it to the current block timestamp if it is 0
        if (_startDate == 0) {
            startDate = currentBlockTimestamp;
        } else {
            startDate = _startDate;
            if (startDate < currentBlockTimestamp) {
                revert InvalidStartDate({limit: currentBlockTimestamp, actual: startDate});
            }
        }
        // check proposal end date and set it to the start date + min duration if it is 0
        uint64 earliestVoteEndDate = startDate + pluginSettings.minVoteDuration;
        // Since `minVoteDuration` is limited to 1 year, `startDate + minVoteDuration`
        // can only overflow if the `startDate` is after `type(uint64).max - minVoteDuration`.
        // In this case, the proposal creation will revert and another date can be picked.
        if (_voteEndDate == 0) {
            voteEndDate = earliestVoteEndDate;
        } else {
            voteEndDate = _voteEndDate;
            if (voteEndDate < earliestVoteEndDate) {
                revert InvalidVoteEndDate({limit: earliestVoteEndDate, actual: voteEndDate});
            }
        }

        uint64 earliestTallyEndDate = voteEndDate + pluginSettings.minTallyDuration;
        if (_tallyEndDate == 0) {
            tallyEndDate = earliestTallyEndDate;
        } else {
            tallyEndDate = _tallyEndDate;
            if (tallyEndDate < earliestTallyEndDate) {
                revert InvalidTallyEndDate({limit: earliestTallyEndDate, actual: tallyEndDate});
            }
        }
    }

    /// @notice Gets the plugin settings.
    /// @return The plugin settings.
    function getPluginSettings() public view returns (PluginSettings memory) {
        return pluginSettings;
    }

    /// @notice Returns true if the provided _member has approved the given proposal tally
    /// @param _proposalId The ID of the proposal.
    /// @return Whether the msg.sender has approved the proposal tally.
    function hasApprovedTally(uint256 _proposalId, address _member) external view returns (bool) {
        return _hasApprovedTally(proposals[_proposalId], _member);
    }

    /// @notice Internal function for checking if a member has approved a proposal tally.
    /// @param _proposal The proposal to check.
    /// @param _member The member to check.
    /// @return Whether the member has approved the proposal tally.
    function _hasApprovedTally(
        Proposal memory _proposal,
        address _member
    ) internal pure returns (bool) {
        for (uint256 i = 0; i < _proposal.approvers.length; ) {
            if (_proposal.approvers[i] == _member) {
                return true;
            }
            unchecked {
                i++;
            }
        }
        return false;
    }

    /// @notice Guard checks that processes key updates are not executed in the same block
    ///          where the plugin settings changed.
    function _guardPluginSettings() internal view {
        if (lastPluginSettingsChange == uint64(block.number)) {
            revert PluginSettingsUpdatedTooRecently({lastUpdate: lastPluginSettingsChange});
        }
    }

    /// @notice Returns the last block number where the plugin settings changed.
    /// @return The last block number where the plugin settings changed.
    function getLastPluginSettingsChange() external view returns (uint64) {
        return lastPluginSettingsChange;
    }
}
