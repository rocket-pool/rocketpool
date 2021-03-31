import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getValidatorPubkey } from '../_utils/beacon';
import { getMinipoolMinimumRPLStake, createMinipool, stakeMinipool, submitMinipoolWithdrawable, payoutMinipool, withdrawMinipool } from '../_helpers/minipool';
import { registerNode, setNodeTrusted, nodeStakeRPL } from '../_helpers/node';
import { getNethBalance, mintRPL } from '../_helpers/tokens';
import { burnNeth } from './scenario-neth-burn';
import { RocketDAOProtocolSettingsMinipool, RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';

export default function() {
    contract('RocketTokenNETH', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            oracleNode,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        let minipool;
        let validatorPubkey = getValidatorPubkey();
        let withdrawalBalance = web3.utils.toWei('36', 'ether');
        let nethBalance;
        before(async () => {

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: oracleNode});
            await setNodeTrusted(oracleNode, 'saas_1', 'node@home.com', owner);

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', 0, {from: owner});

            // Stake RPL to cover minipools
            let rplStake = await getMinipoolMinimumRPLStake();
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Create and withdraw from withdrawable minipool
            minipool = await createMinipool({from: node, value: web3.utils.toWei('32', 'ether')});
            await stakeMinipool(minipool, validatorPubkey, {from: node});
            await submitMinipoolWithdrawable(minipool.address, web3.utils.toWei('32', 'ether'), withdrawalBalance, {from: oracleNode});
            await withdrawMinipool(minipool, {from: node});

            // Get & check node nETH balance
            nethBalance = await getNethBalance(node);
            assert(nethBalance.gt(web3.utils.toBN(0)), 'Incorrect node nETH balance');

        });

        
        it(printTitle('nETH holder', 'can burn nETH for ETH'), async () => {

            // Send ETH to the minipool to simulate receving from SWC
            await web3.eth.sendTransaction({
                from: oracleNode,
                to: minipool.address,
                value: withdrawalBalance
            });

            // Run the payout function now
            await payoutMinipool(minipool, {
                from: oracleNode
            });

            // Burn nETH
            await burnNeth(nethBalance, {
                from: node,
            });

        });


        it(printTitle('nETH holder', 'cannot burn an invalid amount of nETH'), async () => {

            // Send ETH to the minipool to simulate receving from SWC
            await web3.eth.sendTransaction({
                from: oracleNode,
                to: minipool.address,
                value: withdrawalBalance
            });

            // Run the payout function now
            await payoutMinipool(minipool, {
                from: oracleNode
            });

            // Get burn amounts
            let burnZero = web3.utils.toWei('0', 'ether');
            let burnExcess = web3.utils.toBN(web3.utils.toWei('100', 'ether'));
            assert(burnExcess.gt(nethBalance), 'Burn amount does not exceed nETH balance');

            // Attempt to burn 0 nETH
            await shouldRevert(burnNeth(burnZero, {
                from: node,
            }), 'Burned an invalid amount of nETH');

            // Attempt to burn too much nETH
            await shouldRevert(burnNeth(burnExcess, {
                from: node,
            }), 'Burned an amount of nETH greater than the token balance');

        });


        it(printTitle('nETH holder', 'cannot burn nETH with an insufficient contract ETH balance'), async () => {

            // Attempt to burn nETH
            await shouldRevert(burnNeth(nethBalance, {
                from: node,
            }), 'Burned nETH with an insufficient contract ETH balance');

        });


    });
}
