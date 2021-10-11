import { mineBlocks, getCurrentTime, increaseTime } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { getRPLPrice, submitPrices } from '../_helpers/network'
import {
    registerNode,
    setNodeTrusted,
    setNodeWithdrawalAddress,
    nodeStakeRPL,
    nodeWithdrawRPL,
    nodeDeposit,
    getNodeRPLStake,
    getNodeEffectiveRPLStake,
    getTotalEffectiveRPLStake, getCalculatedTotalEffectiveRPLStake
} from '../_helpers/node'
import {
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsNode,
    RocketDAOProtocolSettingsRewards,
    RocketNetworkPrices
} from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting, setRewardsClaimIntervalTime, setRPLInflationStartTime } from '../dao/scenario-dao-protocol-bootstrap'
import { mintRPL } from '../_helpers/tokens';
import { setDAONetworkBootstrapRewardsClaimer, setRPLInflationIntervalRate } from '../dao/scenario-dao-protocol-bootstrap';

// Contracts
import { createMinipool, getNodeStakingMinipoolCount, stakeMinipool, submitMinipoolWithdrawable } from '../_helpers/minipool'
import BN from 'bn.js'
import { close } from '../minipool/scenario-close'
import { dissolve } from '../minipool/scenario-dissolve'
import { userDeposit } from '../_helpers/deposit'


export default function() {
    contract('RocketNodeStaking', async (accounts) => {

        // One day in seconds
        const ONE_DAY = 24 * 60 * 60;
        let scrubPeriod = (60 * 60 * 24); // 24 hours
        const maxStakePerMinipool = '1.5'


        // Accounts
        const [
            owner,
            userOne,
            registeredNode1,
            registeredNode2,
            registeredNode3,
            registeredNodeTrusted1,
            registeredNodeTrusted2,
            registeredNodeTrusted3,
            node1WithdrawalAddress,
            trustedNode,
            daoInvoiceRecipient
        ] = accounts;


        // The testing config
        const claimIntervalTime = ONE_DAY * 28;

        // Set some RPL inflation scenes
        let rplInflationSetup = async function() {
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Starting block for when inflation will begin
            let timeStart = currentTime + ONE_DAY;
            // Yearly inflation target
            let yearlyInflationTarget = 0.05;

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
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});

            // Register nodes
            await registerNode({from: registeredNode1});
            await registerNode({from: registeredNode2});
            await registerNode({from: registeredNode3});
            await registerNode({from: registeredNodeTrusted1});
            await registerNode({from: registeredNodeTrusted2});
            await registerNode({from: registeredNodeTrusted3});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Set node 1 withdrawal address
            await setNodeWithdrawalAddress(registeredNode1, node1WithdrawalAddress, {from: registeredNode1});

            // Set nodes as trusted
            await setNodeTrusted(registeredNodeTrusted1, 'saas_1', 'node@home.com', owner);
            await setNodeTrusted(registeredNodeTrusted2, 'saas_2', 'node@home.com', owner);

            // Set max per-minipool stake to 100% and RPL price to 1 ether
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.per.minipool.stake.maximum', web3.utils.toWei(maxStakePerMinipool, 'ether'), {from: owner});
            let block = await web3.eth.getBlockNumber();
            await submitPrices(block, web3.utils.toWei('1', 'ether'), '0', {from: registeredNodeTrusted1});
            await submitPrices(block, web3.utils.toWei('1', 'ether'), '0', {from: registeredNodeTrusted2});

            // Mint a tonne of RPL for testing
            await mintRPL(owner, registeredNode1, web3.utils.toWei('10000', 'ether'));
            await mintRPL(owner, registeredNode2, web3.utils.toWei('10000', 'ether'));
            await mintRPL(owner, registeredNode3, web3.utils.toWei('10000', 'ether'));
        });


        async function testEffectiveStakeValues() {
          let nodes = [registeredNode1, registeredNode2, registeredNode3];

          let totalStake = web3.utils.toBN('0');
          let rplPrice = await getRPLPrice();

          for(const node of nodes){
              let nodeStakedRpl = await getNodeRPLStake(node);
              let minipoolCount = await getNodeStakingMinipoolCount(node);
              let maxStake = web3.utils.toBN(minipoolCount).mul(web3.utils.toBN(web3.utils.toWei(maxStakePerMinipool, 'ether'))).mul(web3.utils.toBN(web3.utils.toWei('16', 'ether'))).div(rplPrice);
              let expectedEffectiveStake = BN.min(maxStake, nodeStakedRpl);
              let effectiveStake = await getNodeEffectiveRPLStake(node);

              // console.log("Expected / actual / stake / minipool count: ", web3.utils.fromWei(expectedEffectiveStake), web3.utils.fromWei(effectiveStake), web3.utils.fromWei(nodeStakedRpl), minipoolCount.toString());
              assert(effectiveStake.eq(expectedEffectiveStake), "Incorrect effective stake");

              totalStake = totalStake.add(expectedEffectiveStake);
          }

          let actualTotalStake = await getTotalEffectiveRPLStake();
          let calculatedTotalStake = await getCalculatedTotalEffectiveRPLStake(rplPrice);
          // console.log("Expected / actual / calculated: ", web3.utils.fromWei(totalStake), web3.utils.fromWei(actualTotalStake), web3.utils.fromWei(calculatedTotalStake));
          assert(totalStake.eq(actualTotalStake), "Incorrect total effective stake");
          assert(totalStake.eq(calculatedTotalStake), "Incorrect calculated total effective stake");
        }


        async function setPrice(price) {
            await mineBlocks(web3, 1);
            let blockNumber = await web3.eth.getBlockNumber();
            let calculatedTotalEffectiveStake = await getCalculatedTotalEffectiveRPLStake(price);
            await submitPrices(blockNumber, price, calculatedTotalEffectiveStake, {from: registeredNodeTrusted1});
            await submitPrices(blockNumber, price, calculatedTotalEffectiveStake, {from: registeredNodeTrusted2});
        }


        /*** Regular Nodes *************************/


        it(printTitle('node1+2', 'effective stake is correct after prices change'), async () => {
            // Stake RPL against nodes and create minipools to set effective stakes
            await nodeStakeRPL(web3.utils.toWei('32', 'ether'), {from: registeredNode1});
            await nodeStakeRPL(web3.utils.toWei('32', 'ether'), {from: registeredNode2});
            await nodeDeposit({from: registeredNode1, value: web3.utils.toWei('16', 'ether')});
            await nodeDeposit({from: registeredNode2, value: web3.utils.toWei('16', 'ether')});
            await nodeDeposit({from: registeredNode2, value: web3.utils.toWei('16', 'ether')});
            await testEffectiveStakeValues()

            // Double the price of RPL and test
            await setPrice(web3.utils.toWei('2', 'ether'))
            await testEffectiveStakeValues()

            // Quarter the price of RPL and test
            await setPrice(web3.utils.toWei('0.5', 'ether'))
            await testEffectiveStakeValues()
        });


        it(printTitle('node1+2', 'effective stake is correct after various events occur'), async () => {
            // Stake RPL against nodes and create minipools to set effective stakes
            await nodeStakeRPL(web3.utils.toWei('32', 'ether'), {from: registeredNode1});
            await nodeStakeRPL(web3.utils.toWei('32', 'ether'), {from: registeredNode2});
            await nodeDeposit({from: registeredNode1, value: web3.utils.toWei('16', 'ether')});
            await nodeDeposit({from: registeredNode2, value: web3.utils.toWei('16', 'ether')});
            let initialisedMinipool = await createMinipool({from: registeredNode2, value: web3.utils.toWei('16', 'ether')});
            await testEffectiveStakeValues()

            // Increase the price of RPL and create some more minipools
            await setPrice(web3.utils.toWei('2', 'ether'))
            await nodeDeposit({from: registeredNode2, value: web3.utils.toWei('16', 'ether')});
            await testEffectiveStakeValues()

            // Stake some more RPL
            await nodeStakeRPL(web3.utils.toWei('32', 'ether'), {from: registeredNode2});
            await testEffectiveStakeValues()

            // Decrease the price of RPL and destroy some minipools
            await setPrice(web3.utils.toWei('0.75', 'ether'))
            await dissolve(initialisedMinipool, {
                from: registeredNode2,
            });
            // Send 16 ETH to minipool
            await web3.eth.sendTransaction({
                from: owner,
                to: initialisedMinipool.address,
                value: web3.utils.toWei('16', 'ether'),
            });
            await close(initialisedMinipool, {
                from: registeredNode2,
            });
            await testEffectiveStakeValues()
        });


        it(printTitle('node1+2+3', 'effective stake is correct'), async () => {
            // Stake RPL against nodes and create minipools to set effective stakes
            await nodeStakeRPL(web3.utils.toWei('1.6', 'ether'), {from: registeredNode1});
            await nodeStakeRPL(web3.utils.toWei('50', 'ether'), {from: registeredNode2});
            await nodeStakeRPL(web3.utils.toWei('50', 'ether'), {from: registeredNode3});
            await nodeDeposit({from: registeredNode1, value: web3.utils.toWei('16', 'ether')});
            await nodeDeposit({from: registeredNode2, value: web3.utils.toWei('16', 'ether')});
            await nodeDeposit({from: registeredNode3, value: web3.utils.toWei('16', 'ether')});
            await testEffectiveStakeValues()
        });


        it(printTitle('node1', 'cannot stake RPL while network is not in consensus'), async () => {
            const priceFrequency = 50;
            // Set price frequency to a low value so we can mine fewer blocks
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.frequency', priceFrequency, {from: owner});
            // Set withdrawal cooldown to 0
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rpl.rewards.claim.period.time', 0, {from: owner});
            // Set price at current block
            await setPrice(web3.utils.toWei('1', 'ether'))
            // Should be able to stake at current time as price is in consensus
            await nodeStakeRPL(web3.utils.toWei('1.6', 'ether'), {from: registeredNode1});
            // Create a minipool to increase our max RPL stake
            await userDeposit({from: userOne, value: web3.utils.toWei('16', 'ether')});
            const minipool = await createMinipool({from: registeredNode1, value: web3.utils.toWei('16', 'ether')});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool, {from: registeredNode1});
            // Mine blocks until next price window
            await mineBlocks(web3, priceFrequency);
            // Staking should fail now because oracles have not submitted price for this window
            await shouldRevert(nodeStakeRPL(web3.utils.toWei('1.6', 'ether'), {from: registeredNode1}), 'Was able to stake when network was not in consensus about price', 'Network is not in consensus');
            // Test effective stake values
            await testEffectiveStakeValues()
        });



        /*** Trusted Nodes *************************/


        it(printTitle('trusted nodes', 'cannot set price on a block older than when effective stake was updated last'), async () => {
            // Set price
            let blockNumber = await web3.eth.getBlockNumber();
            let price = web3.utils.toWei('1', 'ether');
            let calculatedTotalEffectiveStake = await getCalculatedTotalEffectiveRPLStake(price);
            await submitPrices(blockNumber, price, calculatedTotalEffectiveStake, {from: registeredNodeTrusted1});
            await submitPrices(blockNumber, price, calculatedTotalEffectiveStake, {from: registeredNodeTrusted2});
            // Stake and setup a minipool so that effective rpl stake is updated
            await mineBlocks(web3, 1);
            let oldBlockNumber = await web3.eth.getBlockNumber();
            await mineBlocks(web3, 1);
            await nodeStakeRPL(web3.utils.toWei('10', 'ether'), {from: registeredNode1});
            let minipool = await createMinipool({from: registeredNode1, value: web3.utils.toWei('16', 'ether')});
            await userDeposit({from: userOne, value: web3.utils.toWei('16', 'ether')});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool, {from: registeredNode1});
            // Should not be able to submit a price change at oldBlockNumber as effective stake changed after it
            await submitPrices(oldBlockNumber, price, calculatedTotalEffectiveStake, {from: registeredNodeTrusted1});
            await shouldRevert(submitPrices(oldBlockNumber, price, calculatedTotalEffectiveStake, {from: registeredNodeTrusted2}), 'Was able to update prices at block older than when effective stake was updated last', 'Cannot update effective RPL stake based on block lower than when it was last updated on chain');
        });


        it(printTitle('node1', 'cannot mark a minipool as withdrawable while network is not in consensus'), async () => {
            const priceFrequency = 50;
            // Set price frequency to a low value so we can mine fewer blocks
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.frequency', priceFrequency, {from: owner});
            // Set withdrawal cooldown to 0
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rpl.rewards.claim.period.time', 0, {from: owner});
            // Set price at current block
            await setPrice(web3.utils.toWei('1', 'ether'))
            // Should be able to stake at current time as price is in consensus
            await nodeStakeRPL(web3.utils.toWei('1.6', 'ether'), {from: registeredNode1});
            // Create a minipool to increase our max RPL stake
            await userDeposit({from: userOne, value: web3.utils.toWei('16', 'ether')});
            const minipool = await createMinipool({from: registeredNode1, value: web3.utils.toWei('16', 'ether')});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool, {from: registeredNode1});
            // Mine blocks until next price window
            await mineBlocks(web3, priceFrequency);
            // Mark it as withdrawable
            await submitMinipoolWithdrawable(minipool.address, {from: registeredNodeTrusted1});
            // This one where consensus is reached should fail while not in network consensus about prices
            await shouldRevert(submitMinipoolWithdrawable(minipool.address, {from: registeredNodeTrusted2}), 'Was able to mark minipool as withdrawable when network was not in consensus about price', 'Network is not in consensus');
            // Test effective stake values
            await testEffectiveStakeValues();
            // Set price at current block to bring the network back into consensus about prices
            await setPrice(web3.utils.toWei('1', 'ether'));
            // Should be able to set withdrawable now
            await submitMinipoolWithdrawable(minipool.address, {from: registeredNodeTrusted2});
            // Test effective stake values again
            await testEffectiveStakeValues();
        });
    });
}
