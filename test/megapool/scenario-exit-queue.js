import { getMegapoolForNode } from '../_helpers/megapool';
import assert from 'assert';
import { RocketDepositPool } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const milliToWei = 1000000000000000n;

export async function exitQueue(node, validatorIndex) {
    const megapool = await getMegapoolForNode(node);
    const rocketDepositPool = await RocketDepositPool.deployed();

    const validatorInfoBefore = await megapool.getValidatorInfo(validatorIndex);

    // Dequeue the validator
    await megapool.dequeue(validatorIndex);

    // Check the validator status
    const validatorInfoAfter = await megapool.getValidatorInfo(validatorIndex);
    assert.equal(validatorInfoAfter.staked, false);
    assert.equal(validatorInfoAfter.inQueue, false);

    // Check an ETH credit was applied
    const credit = await rocketDepositPool.getNodeCreditBalance(node.address);
    assertBN.equal(credit, validatorInfoBefore.lastRequestedBond * milliToWei);
}