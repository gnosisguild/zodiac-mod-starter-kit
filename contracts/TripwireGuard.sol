// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.22;

import {Enum} from "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import {BaseGuard} from "@gnosis-guild/zodiac-core/contracts/guard/BaseGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IRiskRegistry} from "./interfaces/IRiskRegistry.sol";

/// @title TripwireGuard
/// @notice A Zodiac Guard enabled on a Safe that vetoes transactions based on
/// an off-chain-computed, on-chain-recorded risk verdict.
///
/// Enforcement is fail-closed: a transaction with no verdict yet recorded is
/// blocked, never allowed. This is deliberate — the off-chain risk engine has
/// a window (a Safe transaction sits pending, unsigned, before it can
/// execute) in which to score it and write a verdict; if that hasn't
/// happened yet, the safe default is "not yet", not "sure, go ahead".
///
/// This issue (#1) ships the skeleton and the freeze switch. Limits (#2) and
/// the delay queue (#3) build on top of `checkTransaction` here.
contract TripwireGuard is BaseGuard, Ownable {
    /// @notice The Safe this Guard is enabled on. checkTransaction/
    /// checkAfterExecution are restricted to it - once limits track state
    /// (spend totals, cooling-off timers), letting anyone call these hooks
    /// directly (bypassing an actual Safe execution) would let an outsider
    /// fabricate spend records and grief the rolling limit for free.
    address public avatar;

    IRiskRegistry public riskRegistry;
    bool public frozen;

    /// @notice A second address, distinct from the owner, allowed to trip
    /// the freeze switch. Meant for the off-chain risk engine's relayer, so
    /// a critical-score verdict can halt the Safe immediately rather than
    /// waiting on an owner to notice an alert. Deliberately one-directional:
    /// only the owner can unfreeze, so the automated system that can trigger
    /// a freeze can never also be the one that lifts it.
    address public freezeAuthority;

    /// @notice Per-transaction cap and rolling 24h velocity cap, enforced
    /// entirely on-chain as a hard backstop — independent of the off-chain
    /// risk engine, so spending limits keep working even if the relayer/LLM
    /// path is down. A value of 0 disables that particular check.
    ///
    /// A breach reverts outright rather than auto-scheduling a retry: the
    /// EVM can't write a "come back later" record and then revert in the
    /// same call (a revert unwinds every state change made during it, so
    /// nothing written right before a `revert` ever persists). The graceful
    /// "wait, then let it through" UX for an over-limit transaction is the
    /// off-chain risk engine's job (#3/#9) - it can see these limits and
    /// `windowSpent()` are public, read them while a transaction is still
    /// only *proposed* (before any signer tries to execute it), and
    /// pre-emptively write a `DELAYED` verdict with its own `releaseAt` to
    /// the RiskRegistry, which `checkTransaction` already honors below.
    uint256 public perTxLimit;
    uint256 public rollingLimit;
    uint256 public constant ROLLING_WINDOW = 1 days;

    uint256 private _windowStart;
    uint256 private _windowSpent;

    /// @dev Value a transaction was approved for in checkTransaction,
    /// consumed in checkAfterExecution so only *executed* value counts
    /// against the rolling limit — a reverted inner call shouldn't burn
    /// the wallet's daily allowance.
    mapping(bytes32 => uint256) private _pendingValue;

    event RiskRegistryUpdated(address indexed riskRegistry);
    event FreezeAuthorityUpdated(address indexed freezeAuthority);
    event GuardFrozen(address indexed by);
    event GuardUnfrozen(address indexed by);
    event LimitsUpdated(uint256 perTxLimit, uint256 rollingLimit);
    event AvatarUpdated(address indexed avatar);

    error GuardIsFrozen();
    error AwaitingRiskScore(bytes32 txHash);
    error BlockedHighRisk(bytes32 txHash, uint8 score);
    error InCoolingOffWindow(bytes32 txHash, uint256 releaseAt);
    error NotOwnerOrFreezeAuthority(address caller);
    error NotAvatar(address caller);
    error PerTxLimitExceeded(bytes32 txHash, uint256 value, uint256 limit);
    error RollingLimitExceeded(bytes32 txHash, uint256 attemptedTotal, uint256 limit);

    modifier onlyOwnerOrFreezeAuthority() {
        if (msg.sender != owner() && msg.sender != freezeAuthority) {
            revert NotOwnerOrFreezeAuthority(msg.sender);
        }
        _;
    }

    modifier onlyAvatar() {
        if (msg.sender != avatar) revert NotAvatar(msg.sender);
        _;
    }

    constructor(address _owner, address _riskRegistry, address _freezeAuthority, address _avatar)
        Ownable(_owner)
    {
        riskRegistry = IRiskRegistry(_riskRegistry);
        emit RiskRegistryUpdated(_riskRegistry);
        freezeAuthority = _freezeAuthority;
        emit FreezeAuthorityUpdated(_freezeAuthority);
        avatar = _avatar;
        emit AvatarUpdated(_avatar);
    }

    function setAvatar(address _avatar) external onlyOwner {
        avatar = _avatar;
        emit AvatarUpdated(_avatar);
    }

    function setRiskRegistry(address _riskRegistry) external onlyOwner {
        riskRegistry = IRiskRegistry(_riskRegistry);
        emit RiskRegistryUpdated(_riskRegistry);
    }

    function setFreezeAuthority(address _freezeAuthority) external onlyOwner {
        freezeAuthority = _freezeAuthority;
        emit FreezeAuthorityUpdated(_freezeAuthority);
    }

    function setLimits(uint256 _perTxLimit, uint256 _rollingLimit) external onlyOwner {
        perTxLimit = _perTxLimit;
        rollingLimit = _rollingLimit;
        emit LimitsUpdated(_perTxLimit, _rollingLimit);
    }

    /// @notice Value already spent in the current rolling 24h window.
    function windowSpent() external view returns (uint256) {
        return _currentWindowSpent();
    }

    /// @notice Emergency circuit breaker: blocks every outgoing transaction
    /// from the Safe regardless of any recorded verdict. Callable by the
    /// owner directly, or by the freeze authority (the risk engine relayer)
    /// when a verdict crosses a critical score threshold off-chain.
    function freeze() external onlyOwnerOrFreezeAuthority {
        frozen = true;
        emit GuardFrozen(msg.sender);
    }

    /// @notice Owner-only, deliberately: whoever can trip the breaker should
    /// never be the same party that can silently reset it.
    function unfreeze() external onlyOwner {
        frozen = false;
        emit GuardUnfrozen(msg.sender);
    }

    /// @dev Matches the exact hashing scheme the off-chain risk engine and
    /// the RiskRegistry both key their verdicts by.
    function txHashOf(address to, uint256 value, bytes memory data, Enum.Operation operation)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(to, value, data, operation));
    }

    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256, /* safeTxGas */
        uint256, /* baseGas */
        uint256, /* gasPrice */
        address, /* gasToken */
        address payable, /* refundReceiver */
        bytes memory, /* signatures */
        address /* msgSender */
    ) external override onlyAvatar {
        if (frozen) revert GuardIsFrozen();

        bytes32 txHash = txHashOf(to, value, data, operation);
        IRiskRegistry.Verdict memory v = riskRegistry.verdictOf(txHash);

        if (v.status == IRiskRegistry.Status.UNSCORED) revert AwaitingRiskScore(txHash);
        if (v.status == IRiskRegistry.Status.FROZEN) revert GuardIsFrozen();
        if (v.status == IRiskRegistry.Status.HIGH_RISK) revert BlockedHighRisk(txHash, v.score);
        // `v.releaseAt` is set per-verdict by the relayer, not by a single
        // Guard-wide delay window - each DELAYED verdict carries its own
        // cooling-off length. Because this always reads the *current*
        // verdict rather than one snapshotted when a tx was first delayed,
        // the risk engine can cancel a delayed transaction mid-window at
        // any time simply by overwriting it to HIGH_RISK - no separate
        // cancellation path needed on the Guard.
        if (v.status == IRiskRegistry.Status.DELAYED && block.timestamp < v.releaseAt) {
            revert InCoolingOffWindow(txHash, v.releaseAt);
        }
        // Status.LOW_RISK, or Status.DELAYED past its releaseAt: the
        // off-chain risk engine cleared it. Still enforce spending limits
        // on-chain as a hard backstop, independent of that verdict.
        if (perTxLimit != 0 && value > perTxLimit) {
            revert PerTxLimitExceeded(txHash, value, perTxLimit);
        }
        if (rollingLimit != 0) {
            uint256 projected = _currentWindowSpent() + value;
            if (projected > rollingLimit) revert RollingLimitExceeded(txHash, projected, rollingLimit);
        }

        _pendingValue[txHash] = value;
    }

    function checkAfterExecution(bytes32 txHash, bool success) external override onlyAvatar {
        uint256 value = _pendingValue[txHash];
        delete _pendingValue[txHash];
        if (success) _recordSpend(value);
    }

    function _currentWindowSpent() internal view returns (uint256) {
        if (block.timestamp >= _windowStart + ROLLING_WINDOW) return 0;
        return _windowSpent;
    }

    function _recordSpend(uint256 value) internal {
        if (value == 0) return;
        if (block.timestamp >= _windowStart + ROLLING_WINDOW) {
            _windowStart = block.timestamp;
            _windowSpent = value;
        } else {
            _windowSpent += value;
        }
    }
}
