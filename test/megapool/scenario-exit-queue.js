import { getMegapoolForNode } from '../_helpers/megapool';
import assert from 'assert';
import { RocketDepositPool, RocketNodeDeposit } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const milliToWei = 1000000000000000n;

export async function exitQueue(node, validatorIndex) {
    const megapool = await getMegapoolForNode(node);
    const rocketDepositPool = await RocketDepositPool.deployed();
    const rocketNodeDeposit = await RocketNodeDeposit.deployed();

    const validatorInfoBefore = await megapool.getValidatorInfo(validatorIndex);
    const bondBefore = await megapool.getNodeBond();
    const creditBefore = await rocketDepositPool.getNodeCreditBalance(node.address);

    const activeValidatorCount = await megapool.getActiveValidatorCount();

    // Dequeue the validator
    await megapool.dequeue(validatorIndex);

    // Calculate bond requirement
    let bondRequirement = 0n;
    if (activeValidatorCount > 1n) {
        bondRequirement = await rocketNodeDeposit.getBondRequirement(activeValidatorCount - 1n);
    }

    let expectedCredit = 0n;
    if (bondRequirement < bondBefore) {
        expectedCredit = bondBefore - bondRequirement;

        if (expectedCredit > '32'.ether) {
            expectedCredit = '32'.ether;
        }
    }

    // Check the validator status
    const validatorInfoAfter = await megapool.getValidatorInfo(validatorIndex);
    assert.equal(validatorInfoAfter.staked, false);
    assert.equal(validatorInfoAfter.inQueue, false);

    // Check an ETH credit was applied
    const creditAfter = await rocketDepositPool.getNodeCreditBalance(node.address);
    const creditDelta = creditAfter - creditBefore;
    assertBN.equal(creditDelta, expectedCredit);
}