import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getNethBalance } from '../_helpers/tokens';


export default function() {
    contract('RocketTokenRPL', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let validatorPubkey = getValidatorPubkey();
        let withdrawalBalance = web3.utils.toWei('36', 'ether');
        let nethBalance;
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

            // Set settings
            await setMinipoolSetting('WithdrawalDelay', 0, {from: owner});

            // Create and withdraw from withdrawable minipool
            let minipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            await stakeMinipool(minipool, validatorPubkey, {from: node});
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), withdrawalBalance, {from: trustedNode});
            await withdrawMinipool(minipool, {from: node});

            // Get & check node nETH balance
            nethBalance = await getNethBalance(node);
            assert(nethBalance.gt(web3.utils.toBN(0)), 'Incorrect node nETH balance');

        });


        it(printTitle('nETH holder', 'can burn nETH for ETH'), async () => {

            // Withdraw minipool validator balance to nETH contract
            await depositValidatorWithdrawal({from: owner, value: withdrawalBalance});
            await processValidatorWithdrawal(validatorPubkey, {from: trustedNode});

            // Burn nETH
            await burnNeth(nethBalance, {
                from: node,
            });

        });


    });
}
