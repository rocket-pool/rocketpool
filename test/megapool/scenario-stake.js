import { getDepositDataRoot } from '../_utils/beacon';
import { getMegapoolWithdrawalCredentials, getValidatorInfo } from '../_helpers/megapool';
import assert from 'assert';
import { assertBN } from '../_helpers/bn';
import { RocketMegapoolManager, RocketNodeStaking } from '../_utils/artifacts';

const milliToWei = 1000000000000000n;
const prestakeBalance = 1000000000n;

const hre = require('hardhat');
const ethers = hre.ethers;

let validatorIndex = 0
const prestakeAmount = '1'.ether
const farFutureEpoch = '18446744073709551615'.BN;

// Stake a megapool validator
export async function stakeMegapoolValidator(megapool, index) {
    const rocketMegapoolManager = await RocketMegapoolManager.deployed();

    async function getData() {
        return await Promise.all([
            megapool.getNodeBond(),
            megapool.getUserCapital(),
            megapool.getNodeQueuedBond(),
            megapool.getUserQueuedCapital(),
            megapool.getActiveValidatorCount(),
            megapool.getAssignedValue(),
        ]).then(
            ([nodeBond, userCapital, nodeQueuedBond, userQueuedCapital, validatorCount, assignedValue]) =>
                ({ nodeBond, userCapital, nodeQueuedBond, userQueuedCapital, validatorCount, assignedValue }),
        );
    }

    // Gather info
    const withdrawalCredentials = await megapool.getWithdrawalCredentials();
    const validatorInfo = await getValidatorInfo(megapool, index);

    // Construct a fake proof
    const proof = {
        validatorIndex: validatorIndex ++,
        validator: {
            pubkey: validatorInfo.pubkey,
            withdrawalCredentials: withdrawalCredentials,
            withdrawableEpoch: farFutureEpoch,
            effectiveBalance: prestakeBalance,
            slashed: false,
            activationEligibilityEpoch: 0n,
            activationEpoch: 0n,
            exitEpoch: farFutureEpoch,
        },
        witnesses: [],
    };

    const slotProof = {
        slot: 0n,
        witnesses: [],
    }

    const infoBefore = await getValidatorInfo(megapool, index);
    const lastAssignedValue = infoBefore.lastRequestedValue * milliToWei;

    // Get current time
    const latestBlock = await ethers.provider.getBlock('latest');
    const currentTime = latestBlock.timestamp;

    // Perform stake operation
    const data1 = await getData();
    await rocketMegapoolManager.stake(megapool.target, index, currentTime, proof, slotProof);
    const data2 = await getData();

    // Check state changes
    const lastDistributionTime = await megapool.getLastDistributionTime();
    const info = await getValidatorInfo(megapool, index);

    assert.equal(info.staked, true);
    assert.equal(info.inQueue, false);
    assert.equal(info.inPrestake, false);
    assert.equal(info.dissolved, false);

    const deltas = {
        nodeBond:data2.nodeBond - data1.nodeBond,
        userCapital: data2.userCapital - data1.userCapital,
        nodeQueuedBond: data2.nodeQueuedBond - data1.nodeQueuedBond,
        userQueuedCapital: data2.userQueuedCapital - data1.userQueuedCapital,
        validatorCount: data2.validatorCount - data1.validatorCount,
        assignedValue: data2.assignedValue - data1.assignedValue,
    }

    assertBN.equal(deltas.nodeBond, 0n);
    assertBN.equal(deltas.userCapital, 0n);
    assertBN.equal(deltas.userQueuedCapital, 0n);
    assertBN.equal(deltas.nodeQueuedBond, 0n);
    assertBN.equal(deltas.assignedValue, -(lastAssignedValue - prestakeAmount));
    assertBN.equal(deltas.validatorCount, 0n);
    assertBN.notEqual(lastDistributionTime, 0n);
}
