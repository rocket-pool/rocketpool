// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;
pragma abicoder v2;

interface RocketMinipoolBondReducerInterface {
    function beginReduceBondAmount(address _minipoolAddress, uint256 _newBondAmount) external;
    function getReduceBondTime(address _minipoolAddress) external view returns (uint256);
    function getReduceBondValue(address _minipoolAddress) external view returns (uint256);
    function getReduceBondCancelled(address _minipoolAddress) external view returns (bool);
    function canReduceBondAmount(address _minipoolAddress) external view returns (bool);
    function voteCancelReduction(address _minipoolAddress) external;
    function reduceBondAmount() external returns (uint256);
    function getLastBondReductionTime(address _minipoolAddress) external view returns (uint256);
    function getLastBondReductionPrevValue(address _minipoolAddress) external view returns (uint256);
    function getLastBondReductionPrevNodeFee(address _minipoolAddress) external view returns (uint256);
}
