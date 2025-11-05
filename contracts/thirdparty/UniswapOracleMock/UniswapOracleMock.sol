// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.30;

/**
    @dev Mock contract to return some valid values for RPL Uniswap TWAP oracle
*/
contract UniswapOracleMock {
    function observe(uint32[] calldata)
    external pure returns (int56[] memory, uint160[] memory)
    {
        int56[] memory tickCumulatives = new int56[](1);
        tickCumulatives[0] = 6108781823772;
        uint160[] memory secondsPerLiquidityCumulativeX128s = new uint160[](1);
        secondsPerLiquidityCumulativeX128s[0] = 356275638166222587133100043722184061953921;
        return (tickCumulatives, secondsPerLiquidityCumulativeX128s);
    }
}