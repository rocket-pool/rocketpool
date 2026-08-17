// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {RocketNodeDeposit} from "../../contracts/contract/node/RocketNodeDeposit.sol";
import {RocketStorageInterface} from "../../contracts/interface/RocketStorageInterface.sol";
import {RocketStorageMock} from "../helpers/RocketStorageMock.sol";

contract RocketNodeDepositSettingsMock {
    uint256[] private baseBonds;
    uint256 private reducedBond;

    constructor() {
        baseBonds.push(4 ether);
        baseBonds.push(8 ether);
        reducedBond = 4 ether;
    }

    function setBaseBondArray(uint256[] memory _baseBonds) external {
        delete baseBonds;
        for (uint256 i = 0; i < _baseBonds.length; ++i) {
            baseBonds.push(_baseBonds[i]);
        }
    }

    function setReducedBond(uint256 _reducedBond) external {
        reducedBond = _reducedBond;
    }

    function getBaseBondArray() external view returns (uint256[] memory) {
        return baseBonds;
    }

    function getReducedBond() external view returns (uint256) {
        return reducedBond;
    }
}

contract RocketNodeDepositTest is Test {
    uint256 private constant MILLI_ETH = 1e15;
    uint256 private constant MAX_FUZZ_VALIDATORS = 1_000_000;

    RocketStorageMock private store;
    RocketNodeDepositSettingsMock private settings;
    RocketNodeDeposit private nodeDeposit;

    function setUp() public {
        store = new RocketStorageMock();
        store.setDeployedStatus(true);
        settings = new RocketNodeDepositSettingsMock();
        nodeDeposit = new RocketNodeDeposit(RocketStorageInterface(address(store)));
        store.setAddress(
            keccak256(abi.encodePacked("contract.address", "rocketDAOProtocolSettingsNode")),
            address(settings)
        );
    }

    function testZeroValidatorsRequiresNoBond() public view {
        assertEq(nodeDeposit.getBondRequirement(0), 0);
    }

    function testCurrentBaseBondEntries() public view {
        assertEq(nodeDeposit.getBondRequirement(1), 4 ether);
        assertEq(nodeDeposit.getBondRequirement(2), 8 ether);
    }

    function testCurrentFourEthReducedBondTail() public view {
        assertEq(nodeDeposit.getBondRequirement(3), 12 ether);
        assertEq(nodeDeposit.getBondRequirement(4), 16 ether);
        assertEq(nodeDeposit.getBondRequirement(10), 40 ether);
    }

    function testReducedBondChangesOnlyTailEntries() public {
        settings.setReducedBond(2 ether);

        assertEq(nodeDeposit.getBondRequirement(1), 4 ether);
        assertEq(nodeDeposit.getBondRequirement(2), 8 ether);
        assertEq(nodeDeposit.getBondRequirement(3), 10 ether);
        assertEq(nodeDeposit.getBondRequirement(10), 24 ether);

        settings.setReducedBond(1 ether);

        assertEq(nodeDeposit.getBondRequirement(1), 4 ether);
        assertEq(nodeDeposit.getBondRequirement(2), 8 ether);
        assertEq(nodeDeposit.getBondRequirement(3), 9 ether);
        assertEq(nodeDeposit.getBondRequirement(10), 16 ether);
    }

    function testTailIsAnchoredToFinalBaseBondEntry() public {
        uint256[] memory baseBonds = new uint256[](3);
        baseBonds[0] = 3 ether;
        baseBonds[1] = 7 ether;
        baseBonds[2] = 10 ether;
        settings.setBaseBondArray(baseBonds);
        settings.setReducedBond(2 ether);

        assertEq(nodeDeposit.getBondRequirement(1), 3 ether);
        assertEq(nodeDeposit.getBondRequirement(2), 7 ether);
        assertEq(nodeDeposit.getBondRequirement(3), 10 ether);
        assertEq(nodeDeposit.getBondRequirement(4), 12 ether);
        assertEq(nodeDeposit.getBondRequirement(8), 20 ether);
    }

    function testFuzzRequirementMatchesReference(
        uint256 validatorCount,
        uint256 reducedBondUnits
    ) public {
        validatorCount = bound(validatorCount, 1, MAX_FUZZ_VALIDATORS);
        uint256 reducedBond = bound(reducedBondUnits, 1_000, 4_000) * MILLI_ETH;
        settings.setReducedBond(reducedBond);

        uint256 expected;
        if (validatorCount == 1) {
            expected = 4 ether;
        } else {
            expected = 8 ether + (validatorCount - 2) * reducedBond;
        }

        assertEq(nodeDeposit.getBondRequirement(validatorCount), expected);
    }

    function testFuzzTailIsMonotonicWithConstantMarginalBond(
        uint256 validatorCount,
        uint256 reducedBondUnits
    ) public {
        validatorCount = bound(validatorCount, 2, MAX_FUZZ_VALIDATORS);
        uint256 reducedBond = bound(reducedBondUnits, 1_000, 4_000) * MILLI_ETH;
        settings.setReducedBond(reducedBond);

        uint256 currentRequirement = nodeDeposit.getBondRequirement(validatorCount);
        uint256 nextRequirement = nodeDeposit.getBondRequirement(validatorCount + 1);

        assertGt(nextRequirement, currentRequirement);
        assertEq(nextRequirement - currentRequirement, reducedBond);
    }
}
