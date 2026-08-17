// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import {Test} from "forge-std/Test.sol";

import {RocketStorageInterface} from "../../contracts/interface/RocketStorageInterface.sol";
import {RocketNetworkFees} from "../../contracts/contract/network/RocketNetworkFees.sol";

contract RocketNetworkFeesStorageMock {
    mapping(bytes32 => address) private addresses;

    function getAddress(bytes32 _key) external view returns (address) {
        return addresses[_key];
    }

    function setAddress(bytes32 _key, address _value) external {
        addresses[_key] = _value;
    }
}

contract RocketNetworkFeeSettingsMock {
    uint256 private immutable minimumNodeFee;
    uint256 private immutable targetNodeFee;
    uint256 private immutable maximumNodeFee;
    uint256 private immutable nodeFeeDemandRange;

    constructor(
        uint256 _minimumNodeFee,
        uint256 _targetNodeFee,
        uint256 _maximumNodeFee,
        uint256 _nodeFeeDemandRange
    ) {
        minimumNodeFee = _minimumNodeFee;
        targetNodeFee = _targetNodeFee;
        maximumNodeFee = _maximumNodeFee;
        nodeFeeDemandRange = _nodeFeeDemandRange;
    }

    function getMinimumNodeFee() external view returns (uint256) {
        return minimumNodeFee;
    }

    function getTargetNodeFee() external view returns (uint256) {
        return targetNodeFee;
    }

    function getMaximumNodeFee() external view returns (uint256) {
        return maximumNodeFee;
    }

    function getNodeFeeDemandRange() external view returns (uint256) {
        return nodeFeeDemandRange;
    }
}

contract RocketNetworkFeesTest is Test {
    uint256 internal constant MINIMUM_FEE = 0.10 ether;
    uint256 internal constant TARGET_FEE = 0.15 ether;
    uint256 internal constant MAXIMUM_FEE = 0.20 ether;
    uint256 internal constant DEMAND_RANGE = 1 ether;
    int256 internal constant FUZZ_BOUND = 1.25 ether;

    RocketNetworkFees internal networkFees;

    function setUp() public {
        RocketNetworkFeesStorageMock store = new RocketNetworkFeesStorageMock();
        RocketNetworkFeeSettingsMock settings = new RocketNetworkFeeSettingsMock(
            MINIMUM_FEE,
            TARGET_FEE,
            MAXIMUM_FEE,
            DEMAND_RANGE
        );
        store.setAddress(
            keccak256(abi.encodePacked("contract.address", "rocketDAOProtocolSettingsNetwork")),
            address(settings)
        );
        networkFees = new RocketNetworkFees(RocketStorageInterface(address(store)));
    }

    function testFeeCurveMatchesLegacyVectors() public view {
        _assertFee(-1.25 ether, 0.10 ether);
        _assertFee(-1.00 ether, 0.10 ether);
        _assertFee(-0.75 ether, 0.12890625 ether);
        _assertFee(-0.50 ether, 0.14375 ether);
        _assertFee(-0.25 ether, 0.14921875 ether);
        _assertFee(0, 0.15 ether);
        _assertFee(0.25 ether, 0.15078125 ether);
        _assertFee(0.50 ether, 0.15625 ether);
        _assertFee(0.75 ether, 0.17109375 ether);
        _assertFee(1.00 ether, 0.20 ether);
        _assertFee(1.25 ether, 0.20 ether);
    }

    function testFuzzFeeIsBoundedAndMonotonic(int256 demandA, int256 demandB) public view {
        demandA = bound(demandA, -FUZZ_BOUND, FUZZ_BOUND);
        demandB = bound(demandB, -FUZZ_BOUND, FUZZ_BOUND);
        if (demandA > demandB) {
            (demandA, demandB) = (demandB, demandA);
        }

        uint256 feeA = networkFees.getNodeFeeByDemand(demandA);
        uint256 feeB = networkFees.getNodeFeeByDemand(demandB);

        assertGe(feeA, MINIMUM_FEE);
        assertLe(feeA, MAXIMUM_FEE);
        assertGe(feeB, MINIMUM_FEE);
        assertLe(feeB, MAXIMUM_FEE);
        assertLe(feeA, feeB);
    }

    function _assertFee(int256 _demand, uint256 _expectedFee) private view {
        assertEq(networkFees.getNodeFeeByDemand(_demand), _expectedFee);
    }
}
