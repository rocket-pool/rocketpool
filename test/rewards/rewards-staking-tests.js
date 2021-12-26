import { getCurrentTime, increaseTime } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { submitPrices } from '../_helpers/network';
import {
    registerNode,
    setNodeTrusted,
    setNodeWithdrawalAddress,
    nodeStakeRPL,
    getNodeEffectiveRPLStake,
} from '../_helpers/node'
import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsNode
} from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting, setRewardsClaimIntervalTime, setRPLInflationStartTime } from '../dao/scenario-dao-protocol-bootstrap'
import { mintRPL } from '../_helpers/tokens';
import { setDAONetworkBootstrapRewardsClaimer, setRPLInflationIntervalRate } from '../dao/scenario-dao-protocol-bootstrap';
import { rewardsClaimAndStakeNode } from './scenario-rewards-claim-staking-node';

// Contracts
import { createMinipool, stakeMinipool } from '../_helpers/minipool'
import { userDeposit } from '../_helpers/deposit'
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';


export default function() {
    contract('RocketRewardsPool', async (accounts) => {

        // One day in seconds
        const ONE_DAY = 24 * 60 * 60;


        // Accounts
        const [
            owner,
            userOne,
            registeredNode1,
            registeredNodeTrusted1,
            node1WithdrawalAddress,
        ] = accounts;


        // The testing config
        const claimIntervalTime = ONE_DAY * 28;
        let scrubPeriod = (60 * 60 * 24); // 24 hours

        // Set some RPL inflation scenes
        let rplInflationSetup = async function() {
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Starting block for when inflation will begin
            let timeStart = currentTime + ONE_DAY;
            // Yearly inflation target
            let yearlyInflationTarget = 0.00001;

            // Set the daily inflation start time
            await setRPLInflationStartTime(timeStart, { from: owner });
            // Set the daily inflation rate
            await setRPLInflationIntervalRate(yearlyInflationTarget, { from: owner });

            // claimIntervalTime must be greater than rewardIntervalTime for tests to properly function
            assert(claimIntervalTime > ONE_DAY, 'Tests will not function correctly unless claimIntervalTime is greater than inflation period (1 day)')

            // Return the starting time for inflation when it will be available
            return timeStart + ONE_DAY;
        }

        // Set a rewards claiming contract
        let rewardsContractSetup = async function(_claimContract, _claimAmountPerc) {
            // Set the amount this contract can claim
            await setDAONetworkBootstrapRewardsClaimer(_claimContract, web3.utils.toWei(_claimAmountPerc.toString(), 'ether'), { from: owner });
            // Set the claim interval blocks
            await setRewardsClaimIntervalTime(claimIntervalTime, { from: owner });
        }


        // Setup
        before(async () => {
            // Disable RocketClaimNode claims contract
            await setDAONetworkBootstrapRewardsClaimer('rocketClaimNode', web3.utils.toWei('0', 'ether'), {from: owner});

            // Set settings
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});

            // Register nodes
            await registerNode({from: registeredNode1});
            await registerNode({from: registeredNodeTrusted1});

            // Set node 1 withdrawal address
            await setNodeWithdrawalAddress(registeredNode1, node1WithdrawalAddress, {from: registeredNode1});

            // Set nodes as trusted
            await setNodeTrusted(registeredNodeTrusted1, 'saas_1', 'node@home.com', owner);

            // Set max per-minipool stake to 100% and RPL price to 1 ether
            const block = await web3.eth.getBlockNumber();
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.per.minipool.stake.maximum', web3.utils.toWei('1', 'ether'), {from: owner});
            await submitPrices(block, web3.utils.toWei('1', 'ether'), '0', {from: registeredNodeTrusted1});

            // Mint RPL
            await mintRPL(owner, registeredNode1, web3.utils.toWei('1.6', 'ether'));
            await nodeStakeRPL(web3.utils.toWei('1.6', 'ether'), {from: registeredNode1});

            // User deposits
            await userDeposit({from: userOne, value: web3.utils.toWei('16', 'ether')});

            // Create minipools
            let minipool1 = await createMinipool({from: registeredNode1, value: web3.utils.toWei('16', 'ether')});

            // Wait required scrub period
            await increaseTime(web3, scrubPeriod + 1);

            // Stake minipools
            await stakeMinipool(minipool1, {from: registeredNode1});

            // Check node effective stakes
            let node1EffectiveStake = await getNodeEffectiveRPLStake(registeredNode1);
            assert(node1EffectiveStake.eq(web3.utils.toBN(web3.utils.toWei('1.6', 'ether'))), 'Incorrect node 1 effective stake');
        });


        it(printTitle('node', 'can claim and stake all RPL without withdrawing it'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.1);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Claim RPL
            await rewardsClaimAndStakeNode({
                from: registeredNode1,
            });

            // Move to next claim interval
            await increaseTime(web3, claimIntervalTime);

            // Claim RPL again
            await rewardsClaimAndStakeNode({
                from: registeredNode1,
            });
        });


        it(printTitle('node', 'can claim and stake some RPL, but has to withdraw the excess stake'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.1);

            // Stake enough RPL to be close to the limit and force the claim to be split between stake and withdrawal
            await mintRPL(owner, registeredNode1, web3.utils.toWei('14', 'ether'));
            await nodeStakeRPL(web3.utils.toWei('14', 'ether'), {from: registeredNode1});

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Claim RPL
            await rewardsClaimAndStakeNode({
                from: registeredNode1,
            });
        });


        it(printTitle('node', 'has to withdraw the entire RPL rewards because the stake is already maxed'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.1);

            // Max the RPL stake to force the claim to withdraw the entire claim and stake nothing
            await mintRPL(owner, registeredNode1, web3.utils.toWei('14.4', 'ether'));
            await nodeStakeRPL(web3.utils.toWei('14.4', 'ether'), {from: registeredNode1});

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Claim RPL
            await rewardsClaimAndStakeNode({
                from: registeredNode1,
            });
        });

    });
}
