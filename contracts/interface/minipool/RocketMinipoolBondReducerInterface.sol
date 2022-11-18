// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

interface RocketMinipoolBondReducerInterface {
    function beginReduceBondAmount(address _minipoolAddress) external;
    function canReduceBondAmount(address _minipoolAddress) external view returns (bool);
    function voteCancelReduction(address _minipoolAddress) external;
    function reduceBondAmount(uint256 _from, uint256 _to) external;
}
