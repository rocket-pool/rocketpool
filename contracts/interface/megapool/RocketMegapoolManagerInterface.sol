// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >0.5.0 <0.9.0;

import "../../contract/megapool/RocketMegapoolStorageLayout.sol";

interface RocketMegapoolManagerInterface {
    function getValidatorCount() external view returns (uint256);
    function addValidator(address _megapoolAddress, uint32 _validatorId) external;
    function getValidatorInfo(uint256 _index) external view returns (RocketMegapoolStorageLayout.ValidatorInfo memory);
}