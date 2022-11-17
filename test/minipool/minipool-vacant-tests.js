import {
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDAONodeTrustedSettingsMinipool,
} from '../_utils/artifacts';
import { increaseTime } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    getMinipoolMinimumRPLStake,
    createVancantMinipool, promoteMinipool, minipoolStates,
} from '../_helpers/minipool';
import {
    registerNode,
    setNodeTrusted,
    setNodeWithdrawalAddress,
    nodeStakeRPL,
    getNodeDepositCredit,
} from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import {
  setDAONodeTrustedBootstrapSetting,
} from '../dao/scenario-dao-node-trusted-bootstrap';
import { upgradeOneDotTwo } from '../_utils/upgrade';
import { voteScrub } from './scenario-scrub';
import { assertBN } from '../_helpers/bn';

export default function() {
    contract('RocketMinipool', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            nodeWithdrawalAddress,
            trustedNode1,
            trustedNode2,
            dummySwc,
            random,
        ] = accounts;


        // Setup
        let launchTimeout =  (60 * 60 * 72); // 72 hours
        let withdrawalDelay = 20;
        let scrubPeriod = (60 * 60 * 24); // 24 hours
        let prelaunchMinipool16;
        let prelaunchMinipool8;

        before(async () => {
            await upgradeOneDotTwo(owner);

            // Register node & set withdrawal address
            await registerNode({from: node});
            await setNodeWithdrawalAddress(node, nodeWithdrawalAddress, {from: node});

            // Register trusted node
            await registerNode({from: trustedNode1});
            await setNodeTrusted(trustedNode1, 'saas_1', 'node@home.com', owner);
            await registerNode({from: trustedNode2});
            await setNodeTrusted(trustedNode2, 'saas_2', 'node@home.com', owner);

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, {from: owner});
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});

            // Set rETH collateralisation target to a value high enough it won't cause excess ETH to be funneled back into deposit pool and mess with our calcs
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.reth.collateral.target', '50'.ether, {from: owner});

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul('7'.BN);
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, {from: node});

            prelaunchMinipool16 = await createVancantMinipool('16'.ether, {from: node});
            prelaunchMinipool8 = await createVancantMinipool('8'.ether, {from: node});

            let prelaunch16Status = await prelaunchMinipool16.getStatus.call();
            let prelaunch8Status = await prelaunchMinipool8.getStatus.call();
            assertBN.equal(prelaunch16Status, minipoolStates.Prelaunch, 'Incorrect prelaunch minipool status');
            assertBN.equal(prelaunch8Status, minipoolStates.Prelaunch, 'Incorrect prelaunch minipool status');
        });


        //
        // Node operator
        //


        it(printTitle('node operator', 'can promote a 16 ETH vacant minipool after scrub period has elapsed'), async () => {
            // Wait required scrub period
            await increaseTime(web3, scrubPeriod + 1);
            // Promote the minipool
            await promoteMinipool(prelaunchMinipool16, {from: node});
            // Verify new status
            let stakingStatus = await prelaunchMinipool16.getStatus.call();
            assertBN.equal(stakingStatus, minipoolStates.Staking, 'Incorrect staking minipool status');
            // Verify deposit credit balance increased by 16 ETH
            let creditBalance = await getNodeDepositCredit(node);
            assertBN.equal(creditBalance, '16'.ether);
        });


        it(printTitle('node operator', 'can promote an 8 ETH vacant minipool after scrub period has elapsed'), async () => {
            // Wait required scrub period
            await increaseTime(web3, scrubPeriod + 1);
            // Promote the minipool
            await promoteMinipool(prelaunchMinipool8, {from: node});
            // Verify new status
            let stakingStatus = await prelaunchMinipool8.getStatus.call();
            assertBN.equal(stakingStatus, minipoolStates.Staking, 'Incorrect staking minipool status');
            // Verify deposit credit balance increased by 24 ETH
            let creditBalance = await getNodeDepositCredit(node);
            assertBN.equal(creditBalance, '24'.ether);
        });


        it(printTitle('node operator', 'cannot promote a vacant minipool before scrub period has elapsed'), async () => {
            // Try to promote (and fail)
            await shouldRevert(promoteMinipool(prelaunchMinipool16, {from: node}), 'Was able to promote minipool during scrub period', 'Not enough time has passed to promote');
        });


        //
        // ODAO
        //


        it(printTitle('trusted node', 'can scrub a prelaunch minipool (no penalty)'), async () => {
            // 2 out of 3 should dissolve the minipool
            await voteScrub(prelaunchMinipool16, {from: trustedNode1});
            await voteScrub(prelaunchMinipool16, {from: trustedNode2});
        });


        it(printTitle('trusted node', 'can scrub a prelaunch minipool (no penalty applied even with scrub penalty active)'), async () => {
            // Enabled penalty
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.penalty.enabled', true, {from: owner});
            // 2 out of 3 should dissolve the minipool
            await voteScrub(prelaunchMinipool16, {from: trustedNode1});
            await voteScrub(prelaunchMinipool16, {from: trustedNode2});
        });

    });
}
