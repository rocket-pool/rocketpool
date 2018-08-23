import { RocketRole } from '../_lib/artifacts';

export async function setupProposerRole({proposerAddress, fromAddress}) {
    const rocketRole = await RocketRole.deployed();
    await rocketRole.adminRoleAdd('proposer', proposerAddress, {from: fromAddress, gas: 250000});
}