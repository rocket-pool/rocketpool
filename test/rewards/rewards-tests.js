import { getCurrentTime, increaseTime } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { submitPrices } from '../_helpers/network';
import {
    registerNode,
    setNodeTrusted,
    setNodeWithdrawalAddress,
    nodeStakeRPL,
    nodeDeposit,
    getNodeGGPStake,
    getNodeEffectiveRPLStake,
    getNodeMinimumRPLStake,
    getTotalEffectiveRPLStake, getCalculatedTotalEffectiveRPLStake
} from '../_helpers/node'
import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNode
} from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting, setRewardsClaimIntervalTime, setRPLInflationStartTime } from '../dao/scenario-dao-protocol-bootstrap'
import { mintRPL } from '../_helpers/tokens';
import { rewardsClaimersPercTotalGet } from './scenario-rewards-claim';
import { setDAONetworkBootstrapRewardsClaimer, spendRewardsClaimTreasury, setRPLInflationIntervalRate } from '../dao/scenario-dao-protocol-bootstrap';
import { rewardsClaimNode } from './scenario-rewards-claim-node';
import { rewardsClaimTrustedNode } from './scenario-rewards-claim-trusted-node';
import { rewardsClaimDAO, getRewardsDAOTreasuryBalance } from './scenario-rewards-claim-dao';

// Contracts
import { RocketRewardsPool } from '../_utils/artifacts';
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
            registeredNode2,
            registeredNodeTrusted1,
            registeredNodeTrusted2,
            registeredNodeTrusted3,
            node1WithdrawalAddress,
            daoInvoiceRecipient
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
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});

            // Register nodes
            await registerNode({from: registeredNode1});
            await registerNode({from: registeredNode2});
            await registerNode({from: registeredNodeTrusted1});
            await registerNode({from: registeredNodeTrusted2});
            await registerNode({from: registeredNodeTrusted3});

            // Set node 1 withdrawal address
            await setNodeWithdrawalAddress(registeredNode1, node1WithdrawalAddress, {from: registeredNode1});

            // Set nodes as trusted
            await setNodeTrusted(registeredNodeTrusted1, 'saas_1', 'node@home.com', owner);
            await setNodeTrusted(registeredNodeTrusted2, 'saas_2', 'node@home.com', owner);

            // Set max per-minipool stake to 100% and RPL price to 1 ether
            const block = await web3.eth.getBlockNumber();
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.per.minipool.stake.maximum', web3.utils.toWei('1', 'ether'), {from: owner});
            await submitPrices(block, web3.utils.toWei('1', 'ether'), '0', {from: registeredNodeTrusted1});
            await submitPrices(block, web3.utils.toWei('1', 'ether'), '0', {from: registeredNodeTrusted2});

            // Mint and stake RPL
            await mintRPL(owner, registeredNode1, web3.utils.toWei('32', 'ether'));
            await mintRPL(owner, registeredNode2, web3.utils.toWei('32', 'ether'));
            await nodeStakeRPL(web3.utils.toWei('32', 'ether'), {from: registeredNode1});
            await nodeStakeRPL(web3.utils.toWei('32', 'ether'), {from: registeredNode2});

            // User deposits
            await userDeposit({from: userOne, value: web3.utils.toWei('48', 'ether')});

            // Create minipools
            let minipool1 = await createMinipool({from: registeredNode1, value: web3.utils.toWei('16', 'ether')});
            let minipool2 = await createMinipool({from: registeredNode2, value: web3.utils.toWei('16', 'ether')});
            let minipool3 = await createMinipool({from: registeredNode2, value: web3.utils.toWei('16', 'ether')});

            // Wait required scrub period
            await increaseTime(web3, scrubPeriod + 1);

            // Stake minipools
            await stakeMinipool(minipool1, {from: registeredNode1});
            await stakeMinipool(minipool2, {from: registeredNode2});
            await stakeMinipool(minipool3, {from: registeredNode2});

          // Check node effective stakes
            let node1EffectiveStake = await getNodeEffectiveRPLStake(registeredNode1);
            let node2EffectiveStake = await getNodeEffectiveRPLStake(registeredNode2);
            assert(node1EffectiveStake.eq(web3.utils.toBN(web3.utils.toWei('16', 'ether'))), 'Incorrect node 1 effective stake');
            assert(node2EffectiveStake.eq(web3.utils.toBN(web3.utils.toWei('32', 'ether'))), 'Incorrect node 2 effective stake');
        });


        /*** Setting Claimers *************************/

                 
        it(printTitle('userOne', 'fails to set interval blocks for rewards claim period'), async () => {
            // Set the rewards claims interval in seconds
            await shouldRevert(setRewardsClaimIntervalTime(100, {
                from: userOne,
            }), 'Non owner set interval blocks for rewards claim period');
        });


        it(printTitle('guardian', 'succeeds setting interval blocks for rewards claim period'), async () => {
            // Set the rewards claims interval in blocks
            await setRewardsClaimIntervalTime(100, {
                from: owner,
            });
        });

                
        it(printTitle('userOne', 'fails to set contract claimer percentage for rewards'), async () => {
            // Set the amount this contract can claim
            await shouldRevert(setDAONetworkBootstrapRewardsClaimer('myHackerContract', web3.utils.toWei('0.1', 'ether'), {
                from: userOne,
            }), 'Non owner set contract claimer percentage for rewards');
        });


        it(printTitle('guardian', 'set contract claimer percentage for rewards, then update it'), async () => {
            // Set the amount this contract can claim
            await setDAONetworkBootstrapRewardsClaimer('rocketClaimDAO', web3.utils.toWei('0.0001', 'ether'), {
                from: owner,
            });
            // Set the amount this contract can claim, then update it
            await setDAONetworkBootstrapRewardsClaimer('rocketClaimNode', web3.utils.toWei('0.01', 'ether'), {
                from: owner,
            });
            // Update now
            await setDAONetworkBootstrapRewardsClaimer('rocketClaimNode', web3.utils.toWei('0.02', 'ether'), {
                from: owner,
            });
        });

        
        it(printTitle('guardian', 'set contract claimer percentage for rewards, then update it to zero'), async () => {
            // Get the total current claims amounts
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await rewardsClaimersPercTotalGet()));
            // Set the amount this contract can claim, then update it
            await setDAONetworkBootstrapRewardsClaimer('rocketClaimNode', web3.utils.toWei('0.01', 'ether'), {
                from: owner,
            });
            // Update now
            await setDAONetworkBootstrapRewardsClaimer('rocketClaimNode', web3.utils.toWei('0', 'ether'), {
                from: owner,
            }, totalClaimersPerc);
        });

      

        it(printTitle('guardian', 'set contract claimers total percentage to 100%'), async () => {
            // Get the total current claims amounts
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await rewardsClaimersPercTotalGet()));
            // Get the total % needed to make 100%
            let claimAmount = (1 - totalClaimersPerc).toFixed(4);
            // Set the amount this contract can claim and expect total claimers amount to equal 1 ether (100%)
            await setDAONetworkBootstrapRewardsClaimer('rocketClaimNode', web3.utils.toWei(claimAmount.toString(), 'ether'), {
                from: owner,
            }, 1);
        });


        it(printTitle('guardian', 'fail to set contract claimers total percentage over 100%'), async () => {
            // Get the total current claims amounts
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await rewardsClaimersPercTotalGet()));
            // Get the total % needed to make 100%
            let claimAmount = ((1 - totalClaimersPerc) + 0.001).toFixed(4); 
            // Set the amount this contract can claim and expect total claimers amount to equal 1 ether (100%)
            await shouldRevert(setDAONetworkBootstrapRewardsClaimer('rocketClaimNode', web3.utils.toWei(claimAmount.toString(), 'ether'), {
                from: owner,
            }), "Total claimers percentrage over 100%");
        });
       
                        
        it(printTitle('userOne', 'fails to call claim method on rewards pool contract as they are not a registered claimer contract'), async () => {
            // Init rewards pool
            const rocketRewardsPool = await RocketRewardsPool.deployed();
            // Try to call the claim method
            await shouldRevert(rocketRewardsPool.claim(userOne, userOne, web3.utils.toWei('0.1'),  {
                from: userOne
            }), "Non claimer network contract called claim method");
        });


        /*** Regular Nodes *************************/

        
        it(printTitle('node', 'can claim RPL'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Claim RPL
            await rewardsClaimNode({
                from: registeredNode1,
            });
            await rewardsClaimNode({
                from: registeredNode2,
            });

            // Move to next claim interval
            await increaseTime(web3, claimIntervalTime);

            // Claim RPL again
            await rewardsClaimNode({
                from: registeredNode1,
            });
            await rewardsClaimNode({
                from: registeredNode2,
            });
        });


        it(printTitle('node', 'cannot claim RPL before inflation has begun'), async () => {
            // Initialize claims contract
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Attempt to claim RPL
            await shouldRevert(rewardsClaimNode({
                from: registeredNode1,
            }), 'Node claimed RPL before RPL inflation began');
        });


        it(printTitle('node', 'cannot claim RPL while the node claim contract is disabled'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Disable RocketClaimNode claims contract
            await setDAONetworkBootstrapRewardsClaimer('rocketClaimNode', web3.utils.toWei('0', 'ether'), {from: owner});

            // Attempt to claim RPL
            await shouldRevert(rewardsClaimNode({
                from: registeredNode1,
            }), 'Node claimed RPL while node claim contract was disabled');
        });


        it(printTitle('node', 'cannot claim RPL twice in the same interval'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Claim RPL
            await rewardsClaimNode({
                from: registeredNode1,
            });

            // Attempt to claim RPL again
            await shouldRevert(rewardsClaimNode({
                from: registeredNode1,
            }), 'Node claimed RPL twice in the same interval');
        });


        it(printTitle('node', 'cannot claim RPL while their node is undercollateralised'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Decrease RPL price to undercollateralize node
            const block = await web3.eth.getBlockNumber();
            const calculatedTotalEffectiveStake = await getCalculatedTotalEffectiveRPLStake(web3.utils.toWei('0.01', 'ether'));
            await submitPrices(block, web3.utils.toWei('0.01', 'ether'), calculatedTotalEffectiveStake, {from: registeredNodeTrusted1});
            await submitPrices(block, web3.utils.toWei('0.01', 'ether'), calculatedTotalEffectiveStake, {from: registeredNodeTrusted2});

            // Get & check node's current and minimum RPL stakes
            let [currentRplStake, minimumRplStake] = await Promise.all([getNodeGGPStake(registeredNode1), getNodeMinimumRPLStake(registeredNode1)]);
            assert(currentRplStake.lt(minimumRplStake), 'Node\'s current RPL stake should be below their minimum RPL stake');

            // Attempt to claim RPL
            await shouldRevert(rewardsClaimNode({
                from: registeredNode1,
            }), 'Node claimed RPL while under collateralised');
        });
        

        /*** Trusted Node *************************/


        it(printTitle('trustedNode1', 'fails to call claim before RPL inflation has begun'), async () => {
            // Setup RPL inflation
            let rplInflationStartTime = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.5);
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Can this trusted node claim before there is any inflation available?
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            // Now make sure we can't claim yet
            await shouldRevert(rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            }), "Made claim before RPL inflation started", "This trusted node is not able to claim yet and must wait until a full claim interval passes");           
        });


        it(printTitle('trustedNode1', 'makes a claim, then fails to make another in the same claim interval'), async () => {
            // Setup RPL inflation
            let rplInflationStartTime = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.1);
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Can this trusted node claim before there is any inflation available?
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            // Move to start of RPL inflation and ahead one claim interval
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);
            // Make a claim now
            await rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            });   
            // Should fail
            await shouldRevert(rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            }), "Made claim again before next interval", "Claimer is not entitled to tokens, they have already claimed in this interval or they are claiming more rewards than available to this claiming contract");               
        });


        it(printTitle('trustedNode3', 'fails to claim rewards as they have not waited one claim interval'), async () => {
            // Setup RPL inflation
            let rplInflationStartTime = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.15);
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Can this trusted node claim before there is any inflation available?
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            // Move to start of RPL inflation and ahead one claim interval
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);
            // Make node 4 trusted now
            await setNodeTrusted(registeredNodeTrusted3, 'saas_3', 'node@home.com', owner);
            // Make a claim now
            await shouldRevert(rewardsClaimTrustedNode(registeredNodeTrusted3, {
                from: registeredNodeTrusted3,
            }), "Made claim before next interval", "This trusted node is not able to claim yet and must wait until a full claim interval passes");                    
        });
             

        it(printTitle('trustedNode1', 'fails to make a claim when trusted node contract claim perc is set to 0'), async () => {
            // Setup RPL inflation
            let rplInflationStartTime = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0);
            // Current block
            let currentTime = await getCurrentTime(web3);
            // Can this trusted node claim before there is any inflation available?
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            // Move to start of RPL inflation and ahead one claim interval
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);
            // Make a claim now
            await shouldRevert(rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            }), "Made claim again before next interval", "This trusted node is not able to claim yet and must wait until a full claim interval passes");                 
        });

    
        it(printTitle('trustedNode1+4', 'trusted node 1 makes a claim after RPL inflation has begun and newly registered trusted node 4 claim in next interval'), async () => {
            // Setup RPL inflation
            let rplInflationStartTime = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.0123);
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Can this trusted node claim before there is any inflation available?
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            // Move to start of RPL inflation and ahead one claim interval
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);
            // Make a claim now
            await rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            });   
            // Make node 3 trusted now
            await setNodeTrusted(registeredNodeTrusted3, 'saas_3', 'node@home.com', owner);
            // Move to next claim interval
            await increaseTime(web3, claimIntervalTime);
            // Attempt claim in the next interval
            await rewardsClaimTrustedNode(registeredNodeTrusted3, {
                from: registeredNodeTrusted3,
            });           
        });
        
        
        it(printTitle('trustedNode1+2+3', 'trusted node 1 makes a claim after RPL inflation has begun, claim rate is changed, then trusted node 2 makes a claim and newly registered trusted node 3 claim in next interval'), async () => {
            // Setup RPL inflation
            let rplInflationStartTime = await rplInflationSetup();
            // Set the contracts perc it can claim 1 =100%
            let claimPercOrig = 0.1;
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', claimPercOrig);
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Can this trusted node claim before there is any inflation available?
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            // Move to start of RPL inflation and ahead one claim interval
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);
            // Make a claim now
            await rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            });   
            // Change inflation rate now, should only kick in on the next interval
            let claimPercChange = 0.2;
            // Update it
            await rewardsContractSetup('rocketClaimTrustedNode', claimPercChange);
            // Make a claim now and pass it the expected contract claim percentage
            await rewardsClaimTrustedNode(registeredNodeTrusted2, {
                from: registeredNodeTrusted2,
            });  
            // Make node 3 trusted now
            await setNodeTrusted(registeredNodeTrusted3, 'saas_3', 'node@home.com', owner);
            // Move ahead 2 claim intervals
            await increaseTime(web3, claimIntervalTime);
            // Attempt claim in the next interval with new inflation rate
            await rewardsClaimTrustedNode(registeredNodeTrusted3, {
                from: registeredNodeTrusted3,
            });           
        });
        

        /*** DAO ***************************/
      

        it(printTitle('daoClaim', 'trusted node makes a claim and the DAO receives its automatic share of rewards correctly on its claim contract, then protocol DAO spends some'), async () => {
            // Setup RPL inflation
            let rplInflationStartTime = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.1);
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Can this trusted node claim before there is any inflation available?
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            // Move to start of RPL inflation and ahead a few claim intervals to simulate some being missed
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime * 3);
            // Make a claim now from a trusted node and verify the DAO collected it's perc
            await rewardsClaimDAO({
                from: registeredNodeTrusted1,
            });    
            // Make a claim now from another trusted node
            await rewardsClaimDAO({
                from: registeredNodeTrusted2,
            }); 
            // Get the balance of the DAO treasury and spend it
            let daoTreasuryBalance = await getRewardsDAOTreasuryBalance();
            // Now spend some via the protocol DAO in bootstrap mode
            await spendRewardsClaimTreasury('invoice123', daoInvoiceRecipient, daoTreasuryBalance, {
                from: owner
            })
        });


        it(printTitle('daoClaim', 'trusted node makes a claim and the DAO receives its automatic share of rewards correctly on its claim contract, then fails to spend more than it has'), async () => {
            // Setup RPL inflation
            let rplInflationStartTime = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.1);
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Can this trusted node claim before there is any inflation available?
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            // Move to start of RPL inflation and ahead a few claim intervals to simulate some being missed
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime * 3);
            // Make a claim now from another trusted node
            await rewardsClaimDAO({
                from: registeredNodeTrusted2,
            }); 
            // Get the balance of the DAO treasury and spend it
            let daoTreasuryBalance = await getRewardsDAOTreasuryBalance();
            // Now spend some via the protocol DAO in bootstrap mode
            await shouldRevert(spendRewardsClaimTreasury('invoice123', daoInvoiceRecipient, daoTreasuryBalance+"1", {
                from: owner,
            }), "Protocol DAO spent more RPL than it had in its treasury", "You cannot send 0 RPL or more than the DAO has in its account");   
        });
        

        it(printTitle('daoClaim', 'trusted node make a claim and the DAO claim rate is set to 0, trusted node makes another 2 claims'), async () => {
            // Setup RPL inflation
            let rplInflationStartTime = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.1);
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Can this trusted node claim before there is any inflation available?
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            // Move to start of RPL inflation and ahead a few claim intervals to simulate some being missed
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);
            // Make a claim now from a trusted node and verify the DAO collected it's perc
            await rewardsClaimDAO({
                from: registeredNodeTrusted1,
            });    
            // Forward to next interval, set claim amount to 0, should kick in the interval after next
            await rewardsContractSetup('rocketClaimDAO', 0);
            // Make a claim now from another trusted node
            await rewardsClaimDAO({
                from: registeredNodeTrusted2,
            }); 
            await rewardsContractSetup('rocketClaimTrustedNode', 0.2);
            // Next interval
            await increaseTime(web3, claimIntervalTime);
            // Make another claim, dao shouldn't receive anything
            await rewardsClaimDAO ({
                from: registeredNodeTrusted2,
            }); 
        });
        
        
        it(printTitle('daoClaim', 'trusted nodes make multiples claims, rewards sent to dao claims contract, DAO rewards address is set and next claims send its balance to its rewards address'), async () => {
            // Setup RPL inflation
            let rplInflationStartTime = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.1);
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Can this trusted node claim before there is any inflation available?
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            // Move to start of RPL inflation and ahead a few claim intervals to simulate some being missed
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);
            // Make a claim now from a trusted node and verify the DAO collected it's perc
            await rewardsClaimDAO({
                from: registeredNodeTrusted1,
            });   
            await rewardsClaimDAO({
                from: registeredNodeTrusted2,
            }); 
            // Next interval
            await increaseTime(web3, claimIntervalTime);
            // Node claim again
            await rewardsClaimDAO({
                from: registeredNodeTrusted1,
            }); 
            // Node claim again
            await rewardsClaimDAO({
                from: registeredNodeTrusted2,
            }); 
        });
    });
}
