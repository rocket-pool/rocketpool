import { revertSnapshot, takeSnapshot } from './evm'

let snapshotId;

export async function startSnapShot() {
  snapshotId = await takeSnapshot(web3);
}

export async function endSnapShot() {
  await revertSnapshot(web3, snapshotId);
}
