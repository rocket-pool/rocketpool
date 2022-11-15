import {
  RocketDAONodeTrustedSettingsMinipool,
  RocketDAOProtocolSettingsMinipool,
  RocketDAOProtocolSettingsNetwork,
} from '../_utils/artifacts';
import { increaseTime } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { userDeposit } from '../_helpers/deposit';
import {
  getMinipoolMinimumRPLStake,
  createMinipool,
  stakeMinipool,
} from '../_helpers/minipool';
import { registerNode, setNodeTrusted, setNodeWithdrawalAddress, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { close } from './scenario-close';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { voteScrub } from './scenario-scrub';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { upgradeOneDotTwo } from '../_utils/upgrade';

export default function() {
    contract('RocketMinipool', async (accounts) => {

        // Accounts
        const [
            owner,
            node,
            nodeWithdrawalAddress,
            trustedNode1,
            trustedNode2,
            trustedNode3,
            random,
        ] = accounts;


        // Setup
        let launchTimeout =  (60 * 60 * 72); // 72 hours
        let withdrawalDelay = 20;
        let scrubPeriod = (60 * 60 * 24); // 24 hours

        let minipoolSalt = 1;

        let prelaunchMinipool;

        before(async () => {
            await upgradeOneDotTwo(owner);

            // Register node & set withdrawal address
            await registerNode({from: node});
            await setNodeWithdrawalAddress(node, nodeWithdrawalAddress, {from: node});

            // Register trusted nodes
            await registerNode({from: trustedNode1});
            await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);
            await registerNode({from: trustedNode2});
            await setNodeTrusted(trustedNode2, 'saas_2', 'node@home.com', owner);
            await registerNode({from: trustedNode3});
            await setNodeTrusted(trustedNode3, 'saas_3', 'node@home.com', owner);

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, {from: owner});
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});

            // Set rETH collateralisation target to a value high enough it won't cause excess ETH to be funneled back into deposit pool and mess with our calcs
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.reth.collateral.target', web3.utils.toWei('50', 'ether'), {from: owner});

            // Make user deposit to fund a prelaunch minipool
            let refundAmount = web3.utils.toWei('16', 'ether');
            await userDeposit({from: random, value: refundAmount});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul(web3.utils.toBN(7));
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            // Create minipool
            prelaunchMinipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')}, minipoolSalt);
        });


        //
        // General
        //


        it(printTitle('node', 'cannot stake a prelaunch pool if scrub period has not elapsed'), async () => {
          await shouldRevert(stakeMinipool(prelaunchMinipool, {from: node}), 'Was able to stake minipool before scrub period elapsed', 'Not enough time has passed to stake');
        });


        it(printTitle('node', 'can stake a prelaunch pool if scrub period has elapsed'), async () => {
          // Increase time by scrub period
          await increaseTime(web3, scrubPeriod + 1);
          // Should be able to stake
          await stakeMinipool(prelaunchMinipool, {from: node});
        });


        it(printTitle('node', 'can close a scrubbed minipool before funds are returned'), async () => {
          await voteScrub(prelaunchMinipool, {from: trustedNode1});
          await voteScrub(prelaunchMinipool, {from: trustedNode2});

          await close(prelaunchMinipool, { from: node, });
        });


        it(printTitle('node', 'can close a scrubbed minipool after funds are returned'), async () => {
          await voteScrub(prelaunchMinipool, {from: trustedNode1});
          await voteScrub(prelaunchMinipool, {from: trustedNode2});

          // Send 16 ETH to minipool
          await web3.eth.sendTransaction({
            from: random,
            to: prelaunchMinipool.address,
            value: web3.utils.toWei('16', 'ether'),
          });

          await close(prelaunchMinipool, { from: node, });
        });


        it(printTitle('node', 'cannot close a scrubbed minipool twice'), async () => {
            await voteScrub(prelaunchMinipool, {from: trustedNode1});
            await voteScrub(prelaunchMinipool, {from: trustedNode2});

            await close(prelaunchMinipool, { from: node, });

            await shouldRevert(close(prelaunchMinipool, { from: node, }), 'Was able to close twice', 'Minipool already closed');
        });


        it(printTitle('node', 'can not create a minipool at the same address after closing'), async () => {
          await voteScrub(prelaunchMinipool, {from: trustedNode1});
          await voteScrub(prelaunchMinipool, {from: trustedNode2});

          // Send 16 ETH to minipool
          await web3.eth.sendTransaction({
            from: random,
            to: prelaunchMinipool.address,
            value: web3.utils.toWei('16', 'ether'),
          });

          await close(prelaunchMinipool, { from: node, });

          // Try to create the pool again
          await shouldRevert(createMinipool({from: node, value: web3.utils.toWei('16', 'ether')}, minipoolSalt), 'Was able to recreate minipool at same address', 'Minipool already exists or was previously destroyed');
        });


        //
        // ODAO
        //


        it(printTitle('trusted node', 'can scrub a prelaunch minipool (no penalty)'), async () => {
          // 2 out of 3 should dissolve the minipool
          await voteScrub(prelaunchMinipool, {from: trustedNode1});
          await voteScrub(prelaunchMinipool, {from: trustedNode2});
        });


        it(printTitle('trusted node', 'can scrub a prelaunch minipool (with penalty)'), async () => {
          // Enabled penalty
          await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.penalty.enabled', true, {from: owner});
          // 2 out of 3 should dissolve the minipool
          await voteScrub(prelaunchMinipool, {from: trustedNode1});
          await voteScrub(prelaunchMinipool, {from: trustedNode2});
        });


        it(printTitle('trusted node', 'cannot vote to scrub twice'), async () => {
          await voteScrub(prelaunchMinipool, {from: trustedNode1});
          await shouldRevert(voteScrub(prelaunchMinipool, {from: trustedNode1}), 'Was able to vote scrub twice from same member', 'Member has already voted to scrub');
        });


        it(printTitle('trust node', 'cannot vote to scrub a staking minipool'), async () => {
          // Increase time by scrub period and stake
          await increaseTime(web3, scrubPeriod + 1);
          await stakeMinipool(prelaunchMinipool, {from: node});
          // Should not be able to vote scrub
          await shouldRevert(voteScrub(prelaunchMinipool, {from: trustedNode1}), 'Was able to vote scrub a staking minipool', 'The minipool can only be scrubbed while in prelaunch');
        });


        //
        // Misc
        //


        it(printTitle('guardian', 'can not set launch timeout lower than scrub period'), async () => {
          await shouldRevert(setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', scrubPeriod-1, {from: owner}), 'Set launch timeout lower than scrub period', 'Launch timeout must be greater than scrub period');
        });


        it(printTitle('guardian', 'can not set scrub period higher than launch timeout'), async () => {
          await shouldRevert(setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', launchTimeout+1, {from: owner}), 'Set scrub period higher than launch timeout', 'Scrub period must be less than launch timeout');
        });
    });
}
