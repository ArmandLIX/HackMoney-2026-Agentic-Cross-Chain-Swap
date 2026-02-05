// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract AgentVault is IUnlockCallback {
    using CurrencyLibrary for Currency;

    IPoolManager public immutable poolManager;
    address public immutable agent;

    struct CallbackData {
        PoolKey key;
        SwapParams params;
    }

    constructor(address _poolManager) {
        poolManager = IPoolManager(_poolManager);
        agent = msg.sender;
    }

    function onFundsReceived(address tokenReceived, uint256 amountReceived, bytes calldata data) external {
        (address tokenOut, uint24 fee) = abi.decode(data, (address, uint24));
        Currency currency0 = Currency.wrap(tokenReceived);
        Currency currency1 = Currency.wrap(tokenOut);
        
        if (currency0 > currency1) {
            (currency0, currency1) = (currency1, currency0);
        }
        PoolKey memory key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: fee,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
        bool zeroForOne = (Currency.wrap(tokenReceived) == key.currency0);
        
        SwapParams memory params = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountReceived),
            sqrtPriceLimitX96: zeroForOne ? 4295128739 + 1 : 1461446703485210103287273052203988822378723970342 - 1
        });

        poolManager.unlock(abi.encode(CallbackData(key, params)));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager));
        CallbackData memory cbData = abi.decode(data, (CallbackData));
        BalanceDelta delta = poolManager.swap(cbData.key, cbData.params, "");

        if (cbData.params.zeroForOne) {
            _pay(cbData.key.currency0, uint256(int256(delta.amount0())));
            poolManager.take(cbData.key.currency1, address(this), uint256(int256(-delta.amount1())));
        } else {
            _pay(cbData.key.currency1, uint256(int256(delta.amount1())));
            poolManager.take(cbData.key.currency0, address(this), uint256(int256(-delta.amount0())));
        }
        return "";
    }

    function _pay(Currency currency, uint256 amount) internal {
        currency.transfer(address(poolManager), amount);
        poolManager.settle();
    }
    
    function withdraw(address token) external {
        require(msg.sender == agent);
        IERC20(token).transfer(agent, IERC20(token).balanceOf(address(this)));
    }
}
