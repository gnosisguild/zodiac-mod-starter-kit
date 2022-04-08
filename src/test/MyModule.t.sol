// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {DSTest} from "ds-test/test.sol";
import {Button} from "../Button.sol";
import {MockSafe} from "../MockSafe.sol";
import {MyModule} from "../MyModule.sol";

contract ContractTest is DSTest {
    Button button;
    MockSafe safe;
    MyModule module;

    function setUp() public {
        button = new Button();
        safe = new MockSafe();
        module = new MyModule(address(safe), address(button));

        button.transferOwnership(address(safe));
        safe.enableModule(address(module));
    }

    function test_CanPressButtonViaModule() public {
        assertEq(button.pushes(), 0);
        module.pushButton();
        assertEq(button.pushes(), 1);
    }

    function testFail_CanNotPressButtonViaModule() public {
        button.pushButton();
    }
}
