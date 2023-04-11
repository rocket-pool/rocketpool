import { revertSnapshot, takeSnapshot } from './evm'

let snapshotId, globalSnapshotId;

export async function startSnapShot() {
  snapshotId = await takeSnapshot(web3);
}

export async function endSnapShot() {
  await revertSnapshot(web3, snapshotId);
}

export async function globalSnapShot() {
  if (globalSnapshotId) {
    await revertSnapshot(web3, globalSnapshotId);
  }
  globalSnapshotId = await takeSnapshot(web3);
}

export function injectGlobalSnapShot(suite, depth) {
  suite.suites.forEach(suite => injectGlobalSnapShot(suite, depth +1));
  if (!suite.root) {
    suite._beforeAll.unshift(suite._createHook('Global snapshot', globalSnapShot));
  }
}
