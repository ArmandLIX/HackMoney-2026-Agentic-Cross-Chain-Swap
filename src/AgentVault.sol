// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

contract AgentVault {
   address public immutable agent;

   event FundsReceived(address indexed token, uint256 amount);

   constructor() {
       agent = msg.sender;
   }

   function deposit(address token, uint256 amount) external {
       IERC20(token).transferFrom(msg.sender, address(this), amount);
       emit FundsReceived(token, amount);
   }

   function executeWithdrawal(address token, address to, uint256 amount) external {
       require(msg.sender == agent, "Only Agent can trigger execution");
       IERC20(token).transfer(to, amount);
   }
}
