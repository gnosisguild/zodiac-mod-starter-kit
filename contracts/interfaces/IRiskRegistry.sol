// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.22;

/// @title IRiskRegistry
/// @notice On-chain record of risk verdicts for pending Safe transactions.
/// @dev The full implementation is tracked separately (see issue #5). This
/// interface lets the Guard (issue #1) be built and tested independently.
interface IRiskRegistry {
    enum Status {
        UNSCORED,
        LOW_RISK,
        DELAYED,
        HIGH_RISK,
        FROZEN
    }

    struct Verdict {
        Status status;
        uint8 score;
        uint256 releaseAt;
    }

    /// @notice Record a verdict for a transaction hash. Relayer-only.
    function submitVerdict(bytes32 txHash, Verdict calldata v) external;

    /// @notice Read the verdict for a transaction hash.
    /// @dev MUST default to `Status.UNSCORED` for any hash that has never
    /// been submitted — a verdict may never silently read as allowed.
    function verdictOf(bytes32 txHash) external view returns (Verdict memory);
}
