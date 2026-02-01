// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("MockToken", "MTK") {
        _mint(msg.sender, 1000 * 10**18);
    }
}

contract AgentVaultTest is Test {
    AgentVault public vault;
    MockToken public token;
    address public manager = address(0x1234567890123456789012345678901234567890);
    address public agent = address(1);
    address public stranger = address(2);

    function setUp() public {
        vm.prank(agent);
        vault = new AgentVault(manager);        
        token = new MockToken();
    }

    function test_Deposit() public {
        token.approve(address(vault), 100 * 10**18);
        vault.deposit(address(token), 100 * 10**18);
        assertEq(token.balanceOf(address(vault)), 100 * 10**18);
    }

    function test_WithdrawAsAgent() public {
        token.transfer(address(vault), 50 * 10**18);
        
        vm.prank(agent);
        vault.executeWithdrawal(address(token), agent, 50 * 10**18);
        assertEq(token.balanceOf(agent), 50 * 10**18);
    }

    function test_Fail_WithdrawAsStranger() public {
        token.transfer(address(vault), 50 * 10**18);
        
        vm.prank(stranger);
        vm.expectRevert("Only Agent can trigger execution");
        vault.executeWithdrawal(address(token), stranger, 50 * 10**18);
    }
}
