import { RocketMegapoolManager } from '../_utils/artifacts';
import { getValidatorInfo } from '../_helpers/megapool';
import assert from 'assert';
import { assertBN } from '../_helpers/bn';

export async function challengeValidator(megapool, validatorIds, challenger) {
    const rocketMegapoolManager = await RocketMegapoolManager.deployed();

    async function getData() {
        let [
            lockedCount,
            infos
        ]
        = await Promise.all([
            megapool.getLockedValidatorCount(),
            Promise.all(validatorIds.map(id => getValidatorInfo(megapool, id)))
        ])

        return { lockedCount, infos };
    }

    const data1 = await getData();

    await rocketMegapoolManager.connect(challenger).challengeExit([
        {
            megapool, validatorIds
        },
    ]);

    const data2 = await getData();

    // Check last challenger was updated
    const lastChallenger = await rocketMegapoolManager.getLastChallenger();
    assert.equal(lastChallenger.toLowerCase(), challenger.address.toLowerCase());

    // Check number of locked validators
    let newlyLockedCount = 0
    for (let i = 0; i < validatorIds.length; ++i) {
        newlyLockedCount += !data1.infos[i].locked ? 1 : 0
        assert.equal(data2.infos[i].locked, true)
    }

    assertBN.equal(data2.lockedCount - data1.lockedCount, BigInt(newlyLockedCount))
}