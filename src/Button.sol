// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Button is Ownable {
    event ButtonPushed(address pusher, uint256 pushes);

    uint256 public pushes;

    constructor(address owner) {
        transferOwnership(owner);
    }

    function pushButton() public onlyOwner {
        pushes++;
        emit ButtonPushed(msg.sender, pushes);
    }
}
