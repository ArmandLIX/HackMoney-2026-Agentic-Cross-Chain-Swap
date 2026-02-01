// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentHook} from "../src/AgentHook.sol";

contract AgentHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    AgentVault vault;
    AgentHook hook;

    function setUp() public {
        deployFreshManagerAndRouters();
        vault = new AgentVault(address(manager)); 
        address hookAddress = address(uint160(Hooks.BEFORE_SWAP_FLAG) | 0x44440000); 
        deployCodeTo("AgentHook.sol", abi.encode(manager, address(vault)), hookAddress);
        hook = AgentHook(hookAddress);
        (currency0, currency1) = deployMintAndApprove2Currencies();
        key = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        manager.initialize(key, SQRT_PRICE_1_1);
        modifyLiquidityRouter.modifyLiquidity(key, ModifyLiquidityParams(-60, 60, 10 ether, 0), ZERO_BYTES);
    }

    function test_revert_unauthorized_swap() public {
        address randomUser = address(0xBad);
        vm.startPrank(randomUser);
        vm.expectRevert(); 
        swapRouter.swap(key, SwapParams(true, 1 ether, SQRT_PRICE_1_2), PoolSwapTest.TestSettings(false, false), ZERO_BYTES);   
        vm.stopPrank();
    }

    function test_authorized_swap_from_vault() public {
        MockERC20(Currency.unwrap(currency0)).mint(address(vault), 10 ether);   
        vm.prank(address(vault));
        swapRouter.swap(
        key, 
        SwapParams(true, 1 ether, SQRT_PRICE_1_2), 
        PoolSwapTest.TestSettings(false, false), 
        ZERO_BYTES);
    }
}
