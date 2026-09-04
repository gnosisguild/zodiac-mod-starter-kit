// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.22;

import {IRiskRegistry} from "../interfaces/IRiskRegistry.sol";

/// @dev Test-only stand-in for the real RiskRegistry (issue #5). Lets
/// TripwireGuard's tests set a verdict directly instead of standing up the
/// full relayer-authorization flow.
contract MockRiskRegistry is IRiskRegistry {
    mapping(bytes32 => Verdict) private _verdicts;

    function submitVerdict(bytes32 txHash, Verdict calldata v) external override {
        _verdicts[txHash] = v;
    }

    function verdictOf(bytes32 txHash) external view override returns (Verdict memory) {
        return _verdicts[txHash];
    }
}
