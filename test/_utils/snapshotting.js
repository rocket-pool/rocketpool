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
