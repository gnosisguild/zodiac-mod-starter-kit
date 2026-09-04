// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.22;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IRiskRegistry} from "./interfaces/IRiskRegistry.sol";

/// @title RiskRegistry
/// @notice On-chain record of risk verdicts, written by the off-chain risk
/// engine (via a single authorized relayer address) and read by
/// TripwireGuard at execution time.
///
/// An unset verdict reads back as `Status.UNSCORED` (the zero value of the
/// enum) purely because of how Solidity mappings default — there is no
/// separate "exists" flag to get wrong, so a transaction the relayer never
/// scored can never be mistaken for one that was scored and approved.
contract RiskRegistry is IRiskRegistry, Ownable {
    mapping(bytes32 => Verdict) private _verdicts;

    address public relayer;

    event VerdictSubmitted(bytes32 indexed txHash, Status status, uint8 score, uint256 releaseAt);
    event RelayerUpdated(address indexed relayer);

    error NotRelayer(address caller);

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer(msg.sender);
        _;
    }

    constructor(address _owner, address _relayer) Ownable(_owner) {
        relayer = _relayer;
        emit RelayerUpdated(_relayer);
    }

    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
        emit RelayerUpdated(_relayer);
    }

    function submitVerdict(bytes32 txHash, Verdict calldata v) external override onlyRelayer {
        _verdicts[txHash] = v;
        emit VerdictSubmitted(txHash, v.status, v.score, v.releaseAt);
    }

    function verdictOf(bytes32 txHash) external view override returns (Verdict memory) {
        return _verdicts[txHash];
    }
}
