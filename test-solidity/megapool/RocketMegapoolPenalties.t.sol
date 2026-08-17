// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {RocketMegapoolPenalties} from "../../contracts/contract/megapool/RocketMegapoolPenalties.sol";
import {RocketNetworkSnapshotsTime} from "../../contracts/contract/network/RocketNetworkSnapshotsTime.sol";
import {RocketStorageInterface} from "../../contracts/interface/RocketStorageInterface.sol";
import {RocketStorageMock} from "../helpers/RocketStorageMock.sol";

contract RocketMegapoolPenaltySettingsMock {
    uint256 private maximumEthPenalty;
    uint256 private penaltyThreshold;

    constructor(uint256 _maximumEthPenalty, uint256 _penaltyThreshold) {
        maximumEthPenalty = _maximumEthPenalty;
        penaltyThreshold = _penaltyThreshold;
    }

    function setMaximumEthPenalty(uint256 _maximumEthPenalty) external {
        maximumEthPenalty = _maximumEthPenalty;
    }

    function setPenaltyThreshold(uint256 _penaltyThreshold) external {
        penaltyThreshold = _penaltyThreshold;
    }

    function getMaximumEthPenalty() external view returns (uint256) {
        return maximumEthPenalty;
    }

    function getPenaltyThreshold() external view returns (uint256) {
        return penaltyThreshold;
    }
}

contract RocketDAONodeTrustedPenaltyMock {
    uint256 private memberCount;

    constructor(uint256 _memberCount) {
        memberCount = _memberCount;
    }

    function setMemberCount(uint256 _memberCount) external {
        memberCount = _memberCount;
    }

    function getMemberCount() external view returns (uint256) {
        return memberCount;
    }
}

contract RocketMegapoolPenaltyTargetMock {
    uint256 public debt;
    uint256 public callCount;
    uint256 public lastAmount;

    function applyPenalty(uint256 _amount) external {
        debt += _amount;
        callCount += 1;
        lastAmount = _amount;
    }
}

contract RocketMegapoolPenaltiesTest is Test {
    uint256 private constant START_TIME = 30 days;
    uint256 private constant START_BLOCK = 100;
    uint256 private constant MAXIMUM_PENALTY = 100 ether;
    uint256 private constant PENALTY_THRESHOLD = 0.51 ether;
    uint256 private constant MAX_MEMBERS = 10;
    uint256 private constant THEFT_BLOCK = 50;
    bytes32 private constant PENALTY_KEY = keccak256("megapool.running.penalty");

    RocketStorageMock private store;
    RocketNetworkSnapshotsTime private snapshots;
    RocketMegapoolPenaltySettingsMock private settings;
    RocketDAONodeTrustedPenaltyMock private trustedNodeDAO;
    RocketMegapoolPenaltyTargetMock private megapool;
    RocketMegapoolPenaltyTargetMock private otherMegapool;
    RocketMegapoolPenalties private penalties;

    event PenaltySubmitted(address indexed from, address megapool, uint256 blockNumber, uint256 amount, uint256 time);
    event PenaltyApplied(address indexed megapool, uint256 blockNumber, uint256 amount, uint256 time);

    function setUp() public {
        vm.warp(START_TIME);
        vm.roll(START_BLOCK);

        store = new RocketStorageMock();
        snapshots = new RocketNetworkSnapshotsTime(RocketStorageInterface(address(store)));
        settings = new RocketMegapoolPenaltySettingsMock(MAXIMUM_PENALTY, PENALTY_THRESHOLD);
        trustedNodeDAO = new RocketDAONodeTrustedPenaltyMock(3);
        megapool = new RocketMegapoolPenaltyTargetMock();
        otherMegapool = new RocketMegapoolPenaltyTargetMock();
        penalties = new RocketMegapoolPenalties(RocketStorageInterface(address(store)));

        store.setAddress(_addressKey("rocketNetworkSnapshotsTime"), address(snapshots));
        store.setAddress(_addressKey("rocketDAOProtocolSettingsMegapool"), address(settings));
        store.setAddress(_addressKey("rocketDAONodeTrusted"), address(trustedNodeDAO));
        store.setBool(_existsKey(address(penalties)), true);
        store.setBool(_megapoolExistsKey(address(megapool)), true);
        store.setBool(_megapoolExistsKey(address(otherMegapool)), true);
        store.setDeployedStatus(true);

        for (uint256 i = 0; i < MAX_MEMBERS; ++i) {
            store.setBool(_trustedMemberKey(_member(i)), true);
        }
    }

    function testRejectsUntrustedSubmitter() public {
        address untrusted = makeAddr("untrusted");

        vm.expectRevert("Invalid trusted node");
        vm.prank(untrusted);
        penalties.penalise(address(megapool), THEFT_BLOCK, 1 ether);
    }

    function testRejectsUnregisteredMegapool() public {
        address unregistered = makeAddr("unregisteredMegapool");

        vm.expectRevert("Invalid megapool");
        vm.prank(_member(0));
        penalties.penalise(unregistered, THEFT_BLOCK, 1 ether);
    }

    function testRejectsZeroAmount() public {
        vm.expectRevert("Invalid penalty amount");
        vm.prank(_member(0));
        penalties.penalise(address(megapool), THEFT_BLOCK, 0);
    }

    function testRejectsCurrentOrFutureBlock() public {
        vm.expectRevert("Invalid block number");
        vm.prank(_member(0));
        penalties.penalise(address(megapool), block.number, 1 ether);

        vm.expectRevert("Invalid block number");
        vm.prank(_member(0));
        penalties.penalise(address(megapool), block.number + 1, 1 ether);
    }

    function testRejectsAmountAboveConfiguredMaximum() public {
        vm.expectRevert("Penalty exceeds maximum");
        vm.prank(_member(0));
        penalties.penalise(address(megapool), THEFT_BLOCK, MAXIMUM_PENALTY + 1);
    }

    function testRejectsDuplicateVoteForExactPenalty() public {
        _vote(_member(0), address(megapool), THEFT_BLOCK, 1 ether);

        vm.expectRevert("Duplicate submission from node");
        vm.prank(_member(0));
        penalties.penalise(address(megapool), THEFT_BLOCK, 1 ether);
        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK, 1 ether), 1);
    }

    function testVoteIdentityIncludesMegapoolBlockAndAmount() public {
        address member = _member(0);
        _vote(member, address(megapool), THEFT_BLOCK, 1 ether);
        _vote(member, address(otherMegapool), THEFT_BLOCK, 1 ether);
        _vote(member, address(megapool), THEFT_BLOCK + 1, 1 ether);
        _vote(member, address(megapool), THEFT_BLOCK, 2 ether);

        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK, 1 ether), 1);
        assertEq(penalties.getVoteCount(address(otherMegapool), THEFT_BLOCK, 1 ether), 1);
        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK + 1, 1 ether), 1);
        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK, 2 ether), 1);
        assertEq(megapool.debt(), 0);
        assertEq(otherMegapool.debt(), 0);
    }

    function testBelowQuorumOnlyRecordsVote() public {
        _vote(_member(0), address(megapool), THEFT_BLOCK, 10 ether);

        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK, 10 ether), 1);
        assertEq(megapool.debt(), 0);
        assertEq(megapool.callCount(), 0);
        assertEq(snapshots.length(PENALTY_KEY), 0);
        assertEq(penalties.getCurrentPenaltyRunningTotal(), 0);
    }

    function testQuorumCrossingAppliesPenaltyAndEmitsEventsInOrder() public {
        uint256 amount = 10 ether;
        _vote(_member(0), address(megapool), THEFT_BLOCK, amount);

        vm.expectEmit(true, false, false, true, address(penalties));
        emit PenaltyApplied(address(megapool), THEFT_BLOCK, amount, block.timestamp);
        vm.expectEmit(true, false, false, true, address(penalties));
        emit PenaltySubmitted(_member(1), address(megapool), THEFT_BLOCK, amount, block.timestamp);
        _vote(_member(1), address(megapool), THEFT_BLOCK, amount);

        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK, amount), 2);
        assertEq(megapool.debt(), amount);
        assertEq(megapool.callCount(), 1);
        assertEq(megapool.lastAmount(), amount);
        assertEq(penalties.getCurrentPenaltyRunningTotal(), amount);
        assertEq(penalties.getCurrentMaxPenalty(), MAXIMUM_PENALTY - amount);
    }

    function testAppliedPenaltyCannotReceiveAnotherVoteOrBeExecuted() public {
        uint256 amount = 10 ether;
        _applyPenalty(address(megapool), THEFT_BLOCK, amount);

        vm.expectRevert("Penalty already applied");
        vm.prank(_member(2));
        penalties.penalise(address(megapool), THEFT_BLOCK, amount);
        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK, amount), 2);

        vm.expectRevert("Penalty already applied");
        penalties.executePenalty(address(megapool), THEFT_BLOCK, amount);
        assertEq(megapool.callCount(), 1);
    }

    function testFourMembersRequireThreeVotesAtFiftyOnePercent() public {
        trustedNodeDAO.setMemberCount(4);
        uint256 amount = 10 ether;

        _vote(_member(0), address(megapool), THEFT_BLOCK, amount);
        _vote(_member(1), address(megapool), THEFT_BLOCK, amount);
        assertEq(megapool.debt(), 0);

        _vote(_member(2), address(megapool), THEFT_BLOCK, amount);
        assertEq(megapool.debt(), amount);
    }

    function testExecutePenaltyBeforeQuorumIsNoOp() public {
        uint256 amount = 10 ether;
        _vote(_member(0), address(megapool), THEFT_BLOCK, amount);

        penalties.executePenalty(address(megapool), THEFT_BLOCK, amount);

        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK, amount), 1);
        assertEq(megapool.debt(), 0);
        assertEq(snapshots.length(PENALTY_KEY), 0);
    }

    function testAnyoneCanExecuteWhenMembershipChangeCreatesQuorum() public {
        trustedNodeDAO.setMemberCount(4);
        uint256 amount = 10 ether;
        _vote(_member(0), address(megapool), THEFT_BLOCK, amount);
        _vote(_member(1), address(megapool), THEFT_BLOCK, amount);
        assertEq(megapool.debt(), 0);

        trustedNodeDAO.setMemberCount(3);
        vm.prank(makeAddr("permissionlessCaller"));
        penalties.executePenalty(address(megapool), THEFT_BLOCK, amount);

        assertEq(megapool.debt(), amount);
        assertEq(megapool.callCount(), 1);
    }

    function testFuzzQuorumRoundsUp(uint8 rawMemberCount) public {
        uint256 memberCount = bound(uint256(rawMemberCount), 1, MAX_MEMBERS);
        trustedNodeDAO.setMemberCount(memberCount);
        uint256 requiredVotes = (PENALTY_THRESHOLD * memberCount + 1 ether - 1) / 1 ether;

        for (uint256 i = 0; i + 1 < requiredVotes; ++i) {
            _vote(_member(i), address(megapool), THEFT_BLOCK, 1 ether);
        }
        assertEq(megapool.debt(), 0);

        _vote(_member(requiredVotes - 1), address(megapool), THEFT_BLOCK, 1 ether);
        assertEq(megapool.debt(), 1 ether);
        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK, 1 ether), requiredVotes);
    }

    function testMultiplePenaltiesAtSameTimeShareCumulativeCheckpoint() public {
        _applyPenalty(address(megapool), THEFT_BLOCK, 30 ether);
        _applyPenalty(address(megapool), THEFT_BLOCK + 1, 20 ether);

        assertEq(snapshots.length(PENALTY_KEY), 1);
        assertEq(penalties.getCurrentPenaltyRunningTotal(), 50 ether);
        assertEq(penalties.getCurrentMaxPenalty(), 50 ether);
        assertEq(megapool.debt(), 50 ether);
        assertEq(megapool.callCount(), 2);
    }

    function testExactMaximumExhaustsCapacity() public {
        _applyPenalty(address(megapool), THEFT_BLOCK, MAXIMUM_PENALTY);
        assertEq(penalties.getCurrentMaxPenalty(), 0);

        _vote(_member(0), address(megapool), THEFT_BLOCK + 1, 1 ether);
        vm.expectRevert("Max penalty exceeded");
        vm.prank(_member(1));
        penalties.penalise(address(megapool), THEFT_BLOCK + 1, 1 ether);

        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK + 1, 1 ether), 1);
        assertEq(megapool.debt(), MAXIMUM_PENALTY);
    }

    function testPenaltyExceedingRemainingCapacityRollsBackQuorumVote() public {
        _applyPenalty(address(megapool), THEFT_BLOCK, 80 ether);
        _vote(_member(0), address(megapool), THEFT_BLOCK + 1, 30 ether);

        vm.expectRevert("Max penalty exceeded");
        vm.prank(_member(1));
        penalties.penalise(address(megapool), THEFT_BLOCK + 1, 30 ether);

        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK + 1, 30 ether), 1);
        assertEq(megapool.debt(), 80 ether);
        assertEq(penalties.getCurrentPenaltyRunningTotal(), 80 ether);
        assertEq(penalties.getCurrentMaxPenalty(), 20 ether);
    }

    function testCapacityReturnsExactlySevenDaysAfterPenalty() public {
        _applyPenalty(address(megapool), THEFT_BLOCK, 40 ether);

        vm.warp(START_TIME + 7 days - 1);
        assertEq(penalties.getCurrentMaxPenalty(), 60 ether);

        vm.warp(START_TIME + 7 days);
        assertEq(penalties.getCurrentMaxPenalty(), MAXIMUM_PENALTY);
        assertEq(penalties.getCurrentPenaltyRunningTotal(), 40 ether);
    }

    function testStaggeredPenaltiesExpireIndependently() public {
        _applyPenalty(address(megapool), THEFT_BLOCK, 40 ether);
        vm.warp(START_TIME + 3 days);
        _applyPenalty(address(megapool), THEFT_BLOCK + 1, 30 ether);
        assertEq(penalties.getCurrentMaxPenalty(), 30 ether);

        vm.warp(START_TIME + 7 days);
        assertEq(penalties.getCurrentMaxPenalty(), 70 ether);

        vm.warp(START_TIME + 10 days);
        assertEq(penalties.getCurrentMaxPenalty(), MAXIMUM_PENALTY);
        assertEq(penalties.getCurrentPenaltyRunningTotal(), 70 ether);
    }

    function testMaximumBelowCurrentUsageReturnsZeroAndRejectsApplication() public {
        _applyPenalty(address(megapool), THEFT_BLOCK, 80 ether);
        settings.setMaximumEthPenalty(60 ether);
        assertEq(penalties.getCurrentMaxPenalty(), 0);

        _vote(_member(0), address(megapool), THEFT_BLOCK + 1, 1 ether);
        vm.expectRevert("Max penalty exceeded");
        vm.prank(_member(1));
        penalties.penalise(address(megapool), THEFT_BLOCK + 1, 1 ether);

        assertEq(megapool.debt(), 80 ether);
        assertEq(penalties.getVoteCount(address(megapool), THEFT_BLOCK + 1, 1 ether), 1);
    }

    function testHistoricalRunningTotalUsesCheckpointAtOrBeforeTime() public {
        _applyPenalty(address(megapool), THEFT_BLOCK, 40 ether);
        vm.warp(START_TIME + 3 days);
        _applyPenalty(address(megapool), THEFT_BLOCK + 1, 30 ether);

        assertEq(penalties.getPenaltyRunningTotalAtTime(uint64(START_TIME - 1)), 0);
        assertEq(penalties.getPenaltyRunningTotalAtTime(uint64(START_TIME)), 40 ether);
        assertEq(penalties.getPenaltyRunningTotalAtTime(uint64(START_TIME + 1 days)), 40 ether);
        assertEq(penalties.getPenaltyRunningTotalAtTime(uint64(START_TIME + 3 days)), 70 ether);
        assertEq(penalties.getPenaltyRunningTotalAtTime(uint64(START_TIME + 4 days)), 70 ether);
    }

    function testFuzzTwoPenaltiesTrackDebtAndRemainingCapacity(uint96 rawFirst, uint96 rawSecond) public {
        uint256 first = bound(uint256(rawFirst), 1, MAXIMUM_PENALTY - 1);
        uint256 second = bound(uint256(rawSecond), 1, MAXIMUM_PENALTY - first);

        _applyPenalty(address(megapool), THEFT_BLOCK, first);
        _applyPenalty(address(megapool), THEFT_BLOCK + 1, second);

        assertEq(megapool.debt(), first + second);
        assertEq(penalties.getCurrentPenaltyRunningTotal(), first + second);
        assertEq(penalties.getCurrentMaxPenalty(), MAXIMUM_PENALTY - first - second);
    }

    function _applyPenalty(address _megapool, uint256 _block, uint256 _amount) private {
        _vote(_member(0), _megapool, _block, _amount);
        _vote(_member(1), _megapool, _block, _amount);
    }

    function _vote(address _memberAddress, address _megapool, uint256 _block, uint256 _amount) private {
        vm.prank(_memberAddress);
        penalties.penalise(_megapool, _block, _amount);
    }

    function _member(uint256 _index) private pure returns (address) {
        return address(uint160(0x1000 + _index));
    }

    function _addressKey(string memory _name) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.address", _name));
    }

    function _existsKey(address _account) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("contract.exists", _account));
    }

    function _megapoolExistsKey(address _megapool) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("megapool.exists", _megapool));
    }

    function _trustedMemberKey(address _memberAddress) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("dao.trustednodes.", "member", _memberAddress));
    }
}
