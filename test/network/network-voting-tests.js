import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    RocketNetworkSnapshots, RocketNetworkVoting, RocketStorage, SnapshotTest,
} from '../_utils/artifacts';
import {
    setDaoNodeTrustedBootstrapUpgrade,
} from '../dao/scenario-dao-node-trusted-bootstrap';
import { assertBN } from '../_helpers/bn';
import { nodeStakeRPL, registerNode } from '../_helpers/node';
import { createMinipool, getMinipoolMaximumRPLStake, getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import { increaseTime, mineBlocks } from '../_utils/evm';

export default function() {
    contract('RocketNetworkVoting', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            random
        ] = accounts;

        let networkSnapshots;
        let networkVoting;

        // Setup
        before(async () => {
            // Get contracts
            networkSnapshots = await RocketNetworkSnapshots.deployed();
            networkVoting = await RocketNetworkVoting.deployed();

            // Register node & set withdrawal address
            await registerNode({from: node});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMaximumRPLStake();
            let rplStake = minipoolRplStake.mul('2'.BN);
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Add some ETH into the DP
            await userDeposit({ from: random, value: '320'.ether, });
        });


        it(printTitle('test', 'test'), async () => {
            // Create a minipool to set the active count to non-zero
            await createMinipool({from: node, value: '16'.ether});
            const blockBefore = (await web3.eth.getBlockNumber());
            await createMinipool({from: node, value: '16'.ether});
            const blockAfter = (await web3.eth.getBlockNumber());

            const votingPowerBefore = await networkVoting.getVotingPower(node, blockBefore);
            const votingPowerAfter = await networkVoting.getVotingPower(node, blockAfter);

            console.log(blockBefore + " : " + votingPowerBefore.toString());
            console.log(blockAfter + " : " + votingPowerAfter.toString());
        });
    });
}
