import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { deposit } from '../_helpers/deposit';
import { createMinipool, stakeMinipool, exitMinipool, withdrawMinipool } from '../_helpers/minipool';
import { withdrawValidator } from '../_helpers/network';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { setNetworkSetting } from '../_helpers/settings';
import { getRethBalance } from '../_helpers/tokens';
import { burnReth } from './scenarios-burn';

export default function() {
    contract('RocketETHToken', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
            staker,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let validatorPubkey = getValidatorPubkey();
        let withdrawalBalance = web3.utils.toWei('36', 'ether');
        let rethBalance;
        before(async () => {

            // Make deposit
            await deposit({from: staker, value: web3.utils.toWei('16', 'ether')});

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, {from: owner});

            // Set settings
            await setNetworkSetting('TargetRethCollateralRate', web3.utils.toWei('1', 'ether'), {from: owner});

            // Create, stake, exit and withdraw minipool
            let minipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            await stakeMinipool(minipool, validatorPubkey, {from: node});
            await exitMinipool(minipool.address, {from: trustedNode});
            await withdrawMinipool(minipool.address, withdrawalBalance, {from: trustedNode});

            // Get & check staker rETH balance
            rethBalance = await getRethBalance(staker);
            assert(rethBalance.gt(web3.utils.toBN(0)), 'Incorrect staker rETH balance');

        });


        it(printTitle('rETH holder', 'can burn rETH for ETH'), async () => {

            // Withdraw minipool validator balance to rETH contract
            await withdrawValidator(validatorPubkey, {from: trustedNode, value: withdrawalBalance});

            // Burn rETH
            await burnReth(rethBalance, {
                from: staker,
            });

        });


    });
}
