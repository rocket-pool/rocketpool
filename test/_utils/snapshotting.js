import currentContext, { after, before, describe as originalDescribe } from 'mocha';

const helpers = require('@nomicfoundation/hardhat-network-helpers');

let globalSnapshot, snapshot;

export async function startSnapShot() {
    snapshot = await helpers.takeSnapshot();
}

export async function endSnapShot() {
    await snapshot.restore();
}

export async function globalSnapShot() {
    if (globalSnapshot) {
        await globalSnapshot.restore();
    }
    globalSnapshot = await helpers.takeSnapshot();
}

const _snapshotDescribe = function(n, tests) {
    return originalDescribe(n, () => {
        let describeSnapshot;

        before(async function() {
            describeSnapshot = await helpers.takeSnapshot();
        });

        after(async function() {
            await describeSnapshot.restore();
        });

        tests();
    });
}

_snapshotDescribe.only = function (...args) {
    return (currentContext.describe || currentContext.suite).only.apply(
        this,
        args
    );
};

_snapshotDescribe.skip = function (...args) {
    return (currentContext.describe || currentContext.suite).skip.apply(
        this,
        args
    );
};

export const snapshotDescribe = _snapshotDescribe