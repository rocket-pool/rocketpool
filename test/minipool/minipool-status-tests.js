import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { createMinipool, stakeMinipool, exitMinipool } from '../_helpers/minipool';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { exit } from './scenarios-exit';
import { withdraw } from './scenarios-withdraw';

export default function() {
    contract('RocketMinipoolStatus', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let stakingMinipool;
        let exitedMinipool;
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

            // Create minipools
            stakingMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            exitedMinipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});

            // Stake minipools
            await stakeMinipool(stakingMinipool, {from: node});
            await stakeMinipool(exitedMinipool, {from: node});

            // Exit minipool
            await exitMinipool(exitedMinipool.address, {from: trustedNode});

            // Check minipool statuses
            let stakingStatus = await stakingMinipool.getStatus.call();
            let exitedStatus = await exitedMinipool.getStatus.call();
            assert(stakingStatus.eq(web3.utils.toBN(2)), 'Incorrect staking minipool status');
            assert(exitedStatus.eq(web3.utils.toBN(3)), 'Incorrect exited minipool status');

        });


        //
        // Exit
        //


        it(printTitle('trusted node', 'can exit a staking minipool'), async () => {

            // Exit staking minipool
            await exit(stakingMinipool.address, {
                from: trustedNode,
            });

        });


        //
        // Withdraw
        //


        it(printTitle('trusted node', 'can withdraw an exited minipool'), async () => {

            // Withdraw exited minipool
            await withdraw(exitedMinipool.address, web3.utils.toWei('36', 'ether'), {
                from: trustedNode,
            });

        });


    });
}
