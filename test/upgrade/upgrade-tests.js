import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsRewards,
    RocketMinipoolManager,
    RocketMinipoolManagerNew,
    RocketNetworkVoting,
    RocketNodeStaking,
    RocketNodeStakingNew, RocketUpgradeOneDotThree,
} from '../_utils/artifacts';
import { increaseTime } from '../_utils/evm';
import { userDeposit } from '../_helpers/deposit';
import {
    createMinipool,
    createVacantMinipool,
    getMinipoolMinimumRPLStake,
    promoteMinipool,
    stakeMinipool,
} from '../_helpers/minipool';
import { nodeStakeRPL, registerNode, setNodeTrusted } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { close } from '../minipool/scenario-close';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { assertBN } from '../_helpers/bn';
import { upgradeExecuted, upgradeOneDotThree } from '../_utils/upgrade';
import { voteScrub } from '../minipool/scenario-scrub';
import { shouldRevert } from '../_utils/testing';

export default function() {
    contract('RocketUpgrade', async (accounts) => {

        // Accounts
        const [
            owner,
            node1,
            node2,
            node3,
            node4,
            emptyNode,
            nodeWithdrawalAddress,
            trustedNode,
            dummySwc,
            random,
        ] = accounts;

        // Setup
        let launchTimeout = (60 * 60 * 72); // 72 hours
        let withdrawalDelay = 20;
        let scrubPeriod = (60 * 60 * 24); // 24 hours
        let bondReductionWindowStart = (2 * 24 * 60 * 60);
        let bondReductionWindowLength = (2 * 24 * 60 * 60);
        let rewardClaimBalanceIntervals = 28;
        let balanceSubmissionFrequency = (60 * 60 * 24);
        let promotionScrubDelay = (60 * 60 * 24); // 24 hours

        let rocketNetworkVoting;

        before(async () => {
            rocketNetworkVoting = await RocketNetworkVoting.deployed();

            // Register trusted node
            await registerNode({ from: trustedNode });
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.launch.timeout', launchTimeout, { from: owner });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.withdrawal.delay', withdrawalDelay, { from: owner });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, { from: owner });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.start', bondReductionWindowStart, { from: owner });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.bond.reduction.window.length', bondReductionWindowLength, { from: owner });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.balances.frequency', balanceSubmissionFrequency, { from: owner });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rewards.claimsperiods', rewardClaimBalanceIntervals, { from: owner });
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.promotion.scrub.period', promotionScrubDelay, {from: owner});

            // Set rETH collateralisation target to a value high enough it won't cause excess ETH to be funneled back into deposit pool and mess with our calcs
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.reth.collateral.target', '50'.ether, { from: owner });

            // Fill up deposit pool
            await userDeposit({ from: random, value: '500'.ether });
        });

        async function getData(nodeAddress) {
            const upgraded = await upgradeExecuted();
            const rocketNodeStaking = upgraded ? await RocketNodeStakingNew.deployed() : await RocketNodeStaking.deployed();
            const rocketMinipoolManager = upgraded ? await RocketMinipoolManagerNew.deployed() : await RocketMinipoolManager.deployed();

            return {
                ethProvided: await rocketNodeStaking.getNodeETHProvided(nodeAddress),
                ethMatched: await rocketNodeStaking.getNodeETHMatched(nodeAddress),
                collatRatio: await rocketNodeStaking.getNodeETHCollateralisationRatio(nodeAddress),
                effective: await rocketNodeStaking.getNodeEffectiveRPLStake(nodeAddress),
                stake: await rocketNodeStaking.getNodeRPLStake(nodeAddress),
                count: await rocketMinipoolManager.getNodeActiveMinipoolCount(nodeAddress),
            };
        }

        function printData(data) {
            console.log(`ethProvided: ` + data.ethProvided.toString());
            console.log(`ethMatched: ` + data.ethMatched.toString());
            console.log(`collatRatio: ` + data.collatRatio.toString());
            console.log(`effective: ` + data.effective.toString());
            console.log(`stake: ` + data.stake.toString());
            console.log(`count: ` + data.count.toString());
        }

        function compareData(data1, data2) {
            assertBN.equal(data1.ethProvided, data2.ethProvided);
            assertBN.equal(data1.ethMatched, data2.ethMatched);
            assertBN.equal(data1.collatRatio, data2.collatRatio);
            assertBN.equal(data1.effective, data2.effective);
            assertBN.equal(data1.stake, data2.stake);
            assertBN.equal(data1.count, data2.count);
        }

        async function setupNode(node) {
            // Register empty node
            await registerNode({ from: node });
            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake.mul('7'.BN);
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, { from: node });
        }

        async function distribute(minipool, node){
            await web3.eth.sendTransaction({
                from: random,
                to: minipool.address,
                value: '32'.ether,
            });
            await minipool.distributeBalance(false, { from: node });
        }

        async function initialiseVoting(node) {
            await rocketNetworkVoting.methods['initialiseVoting()']({ from: node });
        }

        async function scrub(minipool, node) {
            await voteScrub(minipool, { from: trustedNode });
            await close(minipool, { from: node });
        }

        //
        // Pubkey mapping fix
        //

        it('should be able to fix the reverse pubkey mapping', async () => {
            // Register and stake RPL for 1 node
            await setupNode(node1);

            // Create a vacant minipool with current balance of 33
            let minipool1 = await createVacantMinipool('8'.ether, {from: node1}, null, '33'.ether);
            let minipool2 = await createVacantMinipool('16'.ether, {from: node1});

            // Scrub minipool2
            await voteScrub(minipool2, {from: trustedNode});

            // Wait required scrub period
            await increaseTime(hre.web3, promotionScrubDelay + 1);

            // Promote the minipool
            await promoteMinipool(minipool1, {from: node1});

            // Pubkey should be wrong due to bug in previous version
            const rocketMinipoolManager = await RocketMinipoolManager.deployed();
            let actualPubKey = await rocketMinipoolManager.getMinipoolPubkey(minipool1.address);
            let reverseAddress = await rocketMinipoolManager.getMinipoolByPubkey(actualPubKey);
            assert.equal(reverseAddress, "0x0000000000000000000000000000000000000000");

            // Perform upgrade
            await upgradeOneDotThree();

            // Call the fix method
            const rocketUpgrade = await RocketUpgradeOneDotThree.deployed();
            await rocketUpgrade.fixPubkeys([minipool1.address]);

            // Pubkey should be correct now
            actualPubKey = await rocketMinipoolManager.getMinipoolPubkey(minipool1.address);
            reverseAddress = await rocketMinipoolManager.getMinipoolByPubkey(actualPubKey);
            assert.equal(reverseAddress, minipool1.address);

            // Should not be able to call it on the scrubbed minipool
            await shouldRevert(rocketUpgrade.fixPubkeys([minipool2.address]), "Was able to call fix on dissolved minipool", "Minipool was dissolved");
        });

        //
        // State differential tests
        //

        it('creating minipools before and after upgrade', async () => {
            // Register and stake RPL for 3 nodes
            await setupNode(node1);
            await setupNode(node2);
            await setupNode(node4);

            // Create and 8 and a 16 for node2
            await createMinipool({ from: node2, value: '8'.ether });
            await createMinipool({ from: node2, value: '16'.ether });

            const node2Data1 = await getData(node2);

            // Create an 8 for node1
            await createMinipool({ from: node1, value: '8'.ether });

            // Perform upgrade
            await upgradeOneDotThree();

            // Create a 16 for node1
            await createMinipool({ from: node1, value: '16'.ether });

            // Register and stake for node3
            await setupNode(node3);

            // Create and 8 and a 16 for node3
            await createMinipool({ from: node3, value: '8'.ether });
            await createMinipool({ from: node3, value: '16'.ether });

            const node1Data1 = await getData(node1);

            // Create a 16 for node4
            await createMinipool({ from: node4, value: '16'.ether });

            // Initialise voting for node1
            await initialiseVoting(node1);

            // Create an 8 for node4
            await createMinipool({ from: node4, value: '8'.ether });

            const node4Data1 = await getData(node4);
            const node2Data2 = await getData(node2);

            // Initialise voting for node2 and node4
            await initialiseVoting(node2);
            await initialiseVoting(node4);

            // Collect data
            const node1Data2 = await getData(node1);
            const node2Data3 = await getData(node2);
            const node3Data1 = await getData(node3);
            const node4Data2 = await getData(node4);

            // All data should be identical at the times collected
            compareData(node2Data1, node2Data3);
            compareData(node1Data1, node1Data2);
            compareData(node1Data2, node2Data3);
            compareData(node1Data1, node3Data1);
            compareData(node1Data1, node4Data1);
            compareData(node4Data1, node4Data2);
            compareData(node2Data1, node2Data2);
        });

        it('scrub across upgrade', async () => {
            // Create minipool
            await setupNode(node1);
            const minipool1 = await createMinipool({ from: node1, value: '16'.ether });

            const node1Data1 = await getData(node1);

            await upgradeOneDotThree();

            // Scrub
            await scrub(minipool1, node1);

            const node1Data2 = await getData(node1);

            // Same thing with a node post upgrade
            await setupNode(node2);
            const minipool2 = await createMinipool({ from: node2, value: '16'.ether });

            const node2Data1 = await getData(node2);

            // Scrub
            await scrub(minipool2, node2);

            const node2Data2 = await getData(node2);

            compareData(node1Data1, node2Data1);
            compareData(node1Data2, node2Data2);
        });

        it('distribute across upgrade', async () => {
            // Create minipool
            await setupNode(node1);
            const minipool1 = await createMinipool({ from: node1, value: '16'.ether });
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool1, { from: node1 });

            // Perform upgrade
            await upgradeOneDotThree();

            // Distribute
            await distribute(minipool1, node1);

            // Same thing but post upgrade
            await setupNode(node2);
            const minipool2 = await createMinipool({ from: node2, value: '16'.ether });
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool2, { from: node2 });

            // Distribute
            await distribute(minipool2, node2);

            const node1Data1 = await getData(node1);
            await initialiseVoting(node1);
            const node1Data2 = await getData(node1);

            const node2Data = await getData(node2);

            // Should be same outcome
            compareData(node1Data1, node1Data2);
            compareData(node1Data1, node2Data);
        });

        it('distribute with multiple minipools across upgrade', async () => {
            // Create minipool
            await setupNode(node1);
            const minipool1 = await createMinipool({ from: node1, value: '16'.ether });
            await createMinipool({ from: node1, value: '8'.ether });
            await createMinipool({ from: node1, value: '16'.ether });
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool1, { from: node1 });

            await setupNode(node2);
            await createMinipool({ from: node2, value: '8'.ether });

            // Perform upgrade
            await upgradeOneDotThree();

            // Distribute
            await distribute(minipool1, node1);

            const minipool2 = await createMinipool({ from: node2, value: '16'.ether });
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool2, { from: node2 });

            // Distribute
            await distribute(minipool2, node2);

            await createMinipool({ from: node2, value: '16'.ether });

            const node2Data1 = await getData(node2);
            await initialiseVoting(node2);
            const node2Data2 = await getData(node2);

            const node1Data1 = await getData(node1);
            await initialiseVoting(node1);
            const node1Data2 = await getData(node1);

            // Same thing with new node post upgrade
            await setupNode(node3);
            const minipool3 = await createMinipool({ from: node3, value: '16'.ether });
            await createMinipool({ from: node3, value: '8'.ether });
            await createMinipool({ from: node3, value: '16'.ether });
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool3, { from: node3 });
            await distribute(minipool3, node3);

            const node3Data = await getData(node3);

            // Should be same outcome
            compareData(node1Data1, node1Data2);
            compareData(node2Data1, node2Data2);
            compareData(node1Data1, node2Data1);
            compareData(node1Data1, node3Data);
        });

        it('distribute and scrub across upgrade', async () => {
            // Create minipool
            await setupNode(node1);
            const node1minipool1 = await createMinipool({ from: node1, value: '16'.ether });
            const node1minipool2 = await createMinipool({ from: node1, value: '16'.ether });
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(node1minipool2, { from: node1 });

            await upgradeOneDotThree();

            // Scrub
            await scrub(node1minipool1, node1);

            // Distribute
            await distribute(node1minipool2, node1);

            // Do the same thing post upgrade with a fresh node
            await setupNode(node2);
            const node2minipool1 = await createMinipool({ from: node2, value: '16'.ether });
            const node2minipool2 = await createMinipool({ from: node2, value: '16'.ether });
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(node2minipool2, { from: node2 });

            // Scrub
            await scrub(node2minipool1, node2);

            // Distribute
            await distribute(node2minipool2, node2);

            // Check results match
            const node1Data1 = await getData(node1);
            await initialiseVoting(node1);
            const node1Data2 = await getData(node1);
            const node2Data = await getData(node2);
            compareData(node1Data1, node1Data2);
            compareData(node2Data, node1Data1);
        });

        it('scrub before and after upgrade', async () => {
            // Create minipool
            await setupNode(node1);
            const node1minipool1 = await createMinipool({ from: node1, value: '16'.ether });
            const node1minipool2 = await createMinipool({ from: node1, value: '16'.ether });

            // Scrub
            await scrub(node1minipool1, node1);

            // Upgrade
            await upgradeOneDotThree();

            // Scrub
            await scrub(node1minipool2, node1);

            // Same thing post upgrade
            await setupNode(node2);
            const node2minipool1 = await createMinipool({ from: node2, value: '16'.ether });
            const node2minipool2 = await createMinipool({ from: node2, value: '16'.ether });

            // Scrub
            await scrub(node2minipool1, node2);
            await scrub(node2minipool2, node2);

            // Check results match
            const node1Data1 = await getData(node1);
            await initialiseVoting(node1);
            const node1Data2 = await getData(node1);
            const node2Data = await getData(node2);
            compareData(node1Data1, node1Data2);
            compareData(node2Data, node1Data1);
        });

        it('scrub before and after upgrade and throw in some other minipools', async () => {
            // Create minipool
            await setupNode(node1);
            const node1minipool1 = await createMinipool({ from: node1, value: '16'.ether });
            const node1minipool2 = await createMinipool({ from: node1, value: '16'.ether });
            await createMinipool({ from: node1, value: '8'.ether });
            await createMinipool({ from: node1, value: '16'.ether });

            // Scrub
            await scrub(node1minipool1, node1);

            await upgradeOneDotThree();

            // Scrub
            await scrub(node1minipool2, node1);

            // Same thing post upgrade
            await setupNode(node2);
            const node2minipool1 = await createMinipool({ from: node2, value: '16'.ether });
            const node2minipool2 = await createMinipool({ from: node2, value: '16'.ether });

            // Scrub
            await scrub(node2minipool1, node2);
            await scrub(node2minipool2, node2);

            // Create some new ones
            await createMinipool({ from: node1, value: '8'.ether });
            await createMinipool({ from: node2, value: '8'.ether });
            await createMinipool({ from: node2, value: '8'.ether });
            await createMinipool({ from: node2, value: '16'.ether });

            // Check results match
            const node1Data1 = await getData(node1);
            await initialiseVoting(node1);
            const node1Data2 = await getData(node1);
            const node2Data = await getData(node2);
            compareData(node1Data1, node1Data2);
            compareData(node2Data, node1Data1);
        });
    });
}
