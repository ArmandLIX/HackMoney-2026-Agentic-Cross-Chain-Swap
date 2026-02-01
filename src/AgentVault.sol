// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";

contract AgentVault is IUnlockCallback {
    using CurrencyLibrary for Currency;

    address public immutable agent;
    IPoolManager public immutable poolManager;

    struct SwapData {
        PoolKey key;
        SwapParams params;
    }

    constructor(address _poolManager) {
        agent = msg.sender;
        poolManager = IPoolManager(_poolManager);
    }

    function executeSwap(PoolKey calldata key, SwapParams calldata params) external {
        require(msg.sender == agent, "Only Agent can trigger execution");
        _executeSwap(key, params);
    }

    function onFundsReceived(address token, uint256 amount, bytes calldata swapInstruction) external {
        require(amount > 0, "No funds received");
        (PoolKey memory key, SwapParams memory params) = abi.decode(swapInstruction, (PoolKey, SwapParams));
        require(token == Currency.unwrap(key.currency0) || token == Currency.unwrap(key.currency1), "Token mismatch");
        _executeSwap(key, params);
    }

    function _executeSwap(PoolKey memory key, SwapParams memory params) internal {
        poolManager.unlock(abi.encode(SwapData({key: key, params: params})));
    }

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");
        SwapData memory swapData = abi.decode(data, (SwapData));
        BalanceDelta delta = poolManager.swap(swapData.key, swapData.params, "");
        _settle(swapData.key.currency0, delta.amount0());
        _settle(swapData.key.currency1, delta.amount1());       
        return "";
    }

    function _settle(Currency currency, int256 amount) internal {
        if (amount <= 0) return; 
        currency.transfer(address(poolManager), uint256(amount));
        poolManager.settle();
    }

    function executeWithdrawal(address token, address to, uint256 amount) external {
        require(msg.sender == agent, "Only Agent can trigger execution");
        IERC20(token).transfer(to, amount);
    }

    function deposit(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }
}
