import { getDepositDataRoot } from '../_utils/beacon';
import { getMegapoolWithdrawalCredentials, getValidatorInfo } from '../_helpers/megapool';
import assert from 'assert';
import { assertBN } from '../_helpers/bn';

const milliToWei = 1000000000000000n;

const hre = require('hardhat');

// Stake a megapool validator
export async function stakeMegapoolValidator(megapool, index) {
    // Gather info
    const withdrawalCredentials = await megapool.getWithdrawalCredentials();
    const validatorInfo = await getValidatorInfo(megapool, index);
    // Construct a fake proof
    const proof = {
        slot: 0,
        validatorIndex: 0,
        pubkey: validatorInfo.pubkey,
        withdrawalCredentials: withdrawalCredentials,
        witnesses: [],
    };

    let lastAssignedValue = 0n;
    {
        const info = await getValidatorInfo(megapool, index);
        lastAssignedValue = info.lastRequestedValue * milliToWei;
    }

    // Perform stake operation
    const assignedValueBefore = await megapool.getAssignedValue();
    await megapool.stake(index, proof);
    const assignedValueAfter = await megapool.getAssignedValue();

    // Check state changes
    const lastDistributionBlock = await megapool.getLastDistributionBlock();
    const assignedValueDelta = (assignedValueAfter - assignedValueBefore);

    const info = await getValidatorInfo(megapool, index);

    assert.equal(info.staked, true);
    assert.equal(info.inQueue, false);
    assert.equal(info.inPrestake, false);
    assert.equal(info.dissolved, false);

    assertBN.equal(assignedValueDelta, -(lastAssignedValue - '1'.ether));
    assertBN.notEqual(lastDistributionBlock, 0n);
}
