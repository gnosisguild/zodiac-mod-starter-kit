// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.22;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @dev Stands in for "an unverified, freshly-deployed contract" in the
/// drainer demo (#14) - a bare-minimum ERC721 with an open mint, exactly
/// the kind of thing a real scam contract looks like on first glance.
contract MockDrainableNFT is ERC721 {
    uint256 public nextTokenId;

    constructor() ERC721("Definitely Legit NFT", "SCAM") {}

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _mint(to, tokenId);
    }
}
