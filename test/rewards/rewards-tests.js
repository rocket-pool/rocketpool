import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode } from '../_helpers/node';
import { setNodeTrusted } from '../node/scenario-set-trusted';
import { rewardsClaimIntervalBlocksSet, rewardsClaimerPercSet, rewardsClaimIntervalsPassedGet, rewardsClaimersPercTotalGet } from './scenario-rewards-claim';
import { rplInflationIntervalRateSet, rplInflationIntervalBlocksSet, rplInflationStartBlockSet, rplClaimInflation } from '../token/scenario-rpl-inflation';
import { rewardsClaimTrustedNode, rewardsClaimTrustedNodePossibleGet, rewardsClaimTrustedNodeRegisteredBlockGet } from './scenario-rewards-claim-node';

// Contracts
import { RocketRole, RocketRewardsPool, RocketRewardsClaimNode } from '../_utils/artifacts';


export default function() {
    contract.only('RocketRewards', async (accounts) => {


        // Accounts
        const [
            owner,
            userOne,
            userTwo,
            registeredNode,
            registeredNodeTrusted1,
            registeredNodeTrusted2,
            registeredNodeTrusted3,
            registeredNodeTrusted4
        ] = accounts;

        // The testing config
        let claimIntervalBlocks = 10;
        // Interval for calculating inflation
        let rewardIntervalBlocks = 5

        // Set some RPL inflation scenes
        let rplInflationSetup = async function() {
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Starting block for when inflation will begin
            let blockStart = blockCurrent+3;
            // Interval for calculating inflation
            let blockInterval = rewardIntervalBlocks;
            // Yearly inflation target
            let yearlyInflationTarget = 0.05;

            // Set the daily inflation start block
            await rplInflationStartBlockSet(blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(yearlyInflationTarget, { from: owner });
            // Return the starting block for inflation when it will be available
            return blockStart + blockInterval;
        }

        // Set a rewards claiming contract
        let rewardsContractSetup = async function(_claimContract, _claimAmountPerc) {
            // Set the amount this contract can claim
            await rewardsClaimerPercSet(_claimContract, web3.utils.toWei(_claimAmountPerc.toString(), 'ether'), {
                from: owner,
            });
            // Set the claim interval blocks
            await rewardsClaimIntervalBlocksSet(claimIntervalBlocks, {
                from: owner,
            });

        }


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        before(async () => {

            // Register nodes
            await registerNode({from: registeredNode});
            await registerNode({from: registeredNodeTrusted1});
            await registerNode({from: registeredNodeTrusted2});
            await registerNode({from: registeredNodeTrusted3});
            await registerNode({from: registeredNodeTrusted4});
            // Enable last node to be trusted
            await setNodeTrusted(registeredNodeTrusted1, true, {from: owner});
            await setNodeTrusted(registeredNodeTrusted2, true, {from: owner});
            await setNodeTrusted(registeredNodeTrusted3, true, {from: owner});
            // Don't set node 4 as trusted just yet, it's used to test late registrations as trusted below
            

        });

        
       
        it(printTitle('userOne', 'fails to set interval blocks for rewards claim period'), async () => {
            // Set the rewards claims interval in blocks
            await shouldRevert(rewardsClaimIntervalBlocksSet(100, {
                from: userOne,
            }), 'Non owner set interval blocks for rewards claim period');
        });

        it(printTitle('owner', 'succeeds setting interval blocks for rewards claim period'), async () => {
            // Set the rewards claims interval in blocks
            await rewardsClaimIntervalBlocksSet(100, {
                from: owner,
            });
        });

                
        it(printTitle('userOne', 'fails to set contract claimer percentage for rewards'), async () => {
            // Set the amount this contract can claim
            await shouldRevert(rewardsClaimerPercSet('myHackerContract', web3.utils.toWei('0.1', 'ether'), {
                from: userOne,
            }), 'Non owner set contract claimer percentage for rewards');
        });


        it(printTitle('owner', 'set contract claimer percentage for rewards, then update it'), async () => {
            // Set the amount this contract can claim
            await rewardsClaimerPercSet('rocketPoolClaimer2', web3.utils.toWei('0.0001', 'ether'), {
                from: owner,
            });
            // Set the amount this contract can claim, then update it
            await rewardsClaimerPercSet('rocketPoolClaimer1', web3.utils.toWei('0.01', 'ether'), {
                from: owner,
            });
            // Update now
            await rewardsClaimerPercSet('rocketPoolClaimer1', web3.utils.toWei('0.02', 'ether'), {
                from: owner,
            });
        });

        
        it(printTitle('owner', 'set contract claimer percentage for rewards, then update it to zero'), async () => {
            // Get the total current claims amounts
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await rewardsClaimersPercTotalGet()));
            // Set the amount this contract can claim, then update it
            await rewardsClaimerPercSet('rocketPoolClaimer1', web3.utils.toWei('0.01', 'ether'), {
                from: owner,
            });
            // Update now
            await rewardsClaimerPercSet('rocketPoolClaimer1', web3.utils.toWei('0', 'ether'), {
                from: owner,
            }, totalClaimersPerc);
        });

      

        it(printTitle('owner', 'set contract claimers total percentage to 100%'), async () => {
            // Get the total current claims amounts
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await rewardsClaimersPercTotalGet()));
            // Get the total % needed to make 100%
            let claimAmount = (1 - totalClaimersPerc).toFixed(4);
            // Set the amount this contract can claim and expect total claimers amount to equal 1 ether (100%)
            await rewardsClaimerPercSet('rocketPoolClaimer1', web3.utils.toWei(claimAmount.toString(), 'ether'), {
                from: owner,
            }, 1);
        });

        it(printTitle('owner', 'fail to set contract claimers total percentage over 100%'), async () => {
            // Get the total current claims amounts
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await rewardsClaimersPercTotalGet()));
            // Get the total % needed to make 100%
            let claimAmount = ((1 - totalClaimersPerc) + 0.001).toFixed(4); 
            // Set the amount this contract can claim and expect total claimers amount to equal 1 ether (100%)
            await shouldRevert(rewardsClaimerPercSet('rocketPoolClaimer1', web3.utils.toWei(claimAmount.toString(), 'ether'), {
                from: owner,
            }), "Total claimers percentrage over 100%");
        });
       
        
                
        it(printTitle('userOne', 'fails to call claim method on rewards pool contract as they are not a registered claimer contract'), async () => {
            // Init rewards pool
            const rocketRewardsPool = await RocketRewardsPool.deployed();
            // Try to call the claim method
            await shouldRevert(rocketRewardsPool.claim(userOne, web3.utils.toWei('0.1'),  {
                from: userOne
            }), "Non claimer network contract called claim method");
        });
        
        it(printTitle('trustedNode1', 'fails to call claim before RPL inflation has begun'), async () => {
            // Setup RPL inflation for occuring every 10 blocks at 5%
            let rplInflationStartBlock = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.5);
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Can this trusted node claim before there is any inflation available?
            assert(blockCurrent < rplInflationStartBlock, 'Current block should be below RPL inflation start block');
            // Now make sure we can't claim yet
            await shouldRevert(rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            }), "Made claim before RPL inflation started", "This trusted node is not able to claim yet and must wait until a full claim interval passes");           
        });

        it(printTitle('trustedNode1', 'fails to call claim before RPL inflation has begun'), async () => {
            // Setup RPL inflation for occuring every 10 blocks at 5%
            let rplInflationStartBlock = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.5);
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Can this trusted node claim before there is any inflation available?
            assert(blockCurrent < rplInflationStartBlock, 'Current block should be below RPL inflation start block');
            // Now make sure we can't claim yet
            await shouldRevert(rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            }), "Made claim before RPL inflation started", "This trusted node is not able to claim yet and must wait until a full claim interval passes");           
        });

         
                
        it(printTitle('trustedNode1', 'makes a claim, then fails to make another in the same claim interval'), async () => {
            // Setup RPL inflation for occuring every 10 blocks at 5%
            let rplInflationStartBlock = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.1);
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Can this trusted node claim before there is any inflation available?
            assert(blockCurrent < rplInflationStartBlock, 'Current block should be below RPL inflation start block');
            // Move to start of RPL inflation and ahead one claim interval
            await mineBlocks(web3, (rplInflationStartBlock-blockCurrent)+claimIntervalBlocks);
            // Make a claim now
            await rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            });   
            // Should fail
            await shouldRevert(rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            }), "Made claim again before next interval", "Claimer is not entitled to tokens, they have already claimed in this interval or they are claiming more rewards than available to this claiming contract");    
                       
        });


        it(printTitle('trustedNode4', 'fails to claim rewards as they have not waited one claim interval'), async () => {
            // Setup RPL inflation for occuring every 10 blocks at 5%
            let rplInflationStartBlock = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.15);
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Can this trusted node claim before there is any inflation available?
            assert(blockCurrent < rplInflationStartBlock, 'Current block should be below RPL inflation start block');
            // Move to start of RPL inflation
            await mineBlocks(web3, rplInflationStartBlock-blockCurrent);
            // Make node 4 trusted now
            await setNodeTrusted(registeredNodeTrusted4, true, {from: owner});
            // Get the current block
            blockCurrent = await web3.eth.getBlockNumber();
            // Make a claim now
            await shouldRevert(rewardsClaimTrustedNode(registeredNodeTrusted4, {
                from: registeredNodeTrusted4,
            }), "Made claim before next interval", "This trusted node is not able to claim yet and must wait until a full claim interval passes");                    
        });
        
        
        it(printTitle('trustedNode1', 'fails to make a claim when removed as trusted node operator'), async () => {
            // Setup RPL inflation for occuring every 10 blocks at 5%
            let rplInflationStartBlock = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.05);
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Can this trusted node claim before there is any inflation available?
            assert(blockCurrent < rplInflationStartBlock, 'Current block should be below RPL inflation start block');
            // Move to start of RPL inflation and ahead one claim interval
            await mineBlocks(web3, (rplInflationStartBlock-blockCurrent)+claimIntervalBlocks);
            // Remove as trusted node
            await setNodeTrusted(registeredNodeTrusted1, false, {from: owner});
            // Make a claim now
            await shouldRevert(rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            }), "Made claim again before next interval", "Invalid trusted node");                 
        });

        

        it(printTitle('trustedNode1', 'fails to make a claim when trusted node contract claim perc is set to 0'), async () => {
            // Setup RPL inflation for occuring every 10 blocks at 5%
            let rplInflationStartBlock = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0);
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Can this trusted node claim before there is any inflation available?
            assert(blockCurrent < rplInflationStartBlock, 'Current block should be below RPL inflation start block');
            // Move to start of RPL inflation and ahead one claim interval
            await mineBlocks(web3, (rplInflationStartBlock-blockCurrent)+claimIntervalBlocks);
            // Make a claim now
            await shouldRevert(rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            }), "Made claim again before next interval", "Not a valid rewards claiming contact or it has been disabled");                 
        });

    
        it(printTitle('trustedNode1+4', 'trusted node 1 makes a claim after RPL inflation has begun and newly registered trusted node 4 claim in next interval'), async () => {
            // Setup RPL inflation for occuring every 10 blocks at 5%
            let rplInflationStartBlock = await rplInflationSetup();
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', 0.0123);
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Can this trusted node claim before there is any inflation available?
            assert(blockCurrent < rplInflationStartBlock, 'Current block should be below RPL inflation start block');
            // Move to start of RPL inflation
            await mineBlocks(web3, (rplInflationStartBlock-blockCurrent)+claimIntervalBlocks);
            // Make a claim now
            await rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            });   
            // Make node 4 trusted now
            await setNodeTrusted(registeredNodeTrusted4, true, {from: owner});
            // Move to next claim interval
            await mineBlocks(web3, claimIntervalBlocks);
            // Attempt claim in the next interval
            await rewardsClaimTrustedNode(registeredNodeTrusted4, {
                from: registeredNodeTrusted4,
            });           
        });

        

        it(printTitle('trustedNode1+2+3+4', 'trusted node 1 makes a claim after RPL inflation has begun, claim rate is changed, then trusted node 2,3 makes a claim and newly registered trusted node 4 claim in next interval'), async () => {
            // Setup RPL inflation for occuring every 10 blocks at 5%
            let rplInflationStartBlock = await rplInflationSetup();
            // Set the contracts perc it can claim 1 =100%
            let claimPercOrig = 0.1;
            // Init this claiming contract on the rewards pool
            await rewardsContractSetup('rocketClaimTrustedNode', claimPercOrig);
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();
            // Can this trusted node claim before there is any inflation available?
            assert(blockCurrent < rplInflationStartBlock, 'Current block should be below RPL inflation start block');
            // Move to start of RPL inflation
            await mineBlocks(web3, (rplInflationStartBlock-blockCurrent)+rewardIntervalBlocks);
            // Make a claim now
            await rewardsClaimTrustedNode(registeredNodeTrusted1, {
                from: registeredNodeTrusted1,
            }, claimPercOrig);   
            // Change inflation rate now, should only kick in on the next interval
            let claimPercChange = 0.2;
            // Update it
            await rewardsContractSetup('rocketClaimTrustedNode', claimPercChange);
            // Make a claim now and pass it the expected contract claim percentage
            await rewardsClaimTrustedNode(registeredNodeTrusted2, {
                from: registeredNodeTrusted2,
            }, claimPercOrig);  
            // Make a claim now
            await rewardsClaimTrustedNode(registeredNodeTrusted3, {
                from: registeredNodeTrusted3,
            }, claimPercOrig);  
            // Make node 4 trusted now
            await setNodeTrusted(registeredNodeTrusted4, true, {from: owner});
            // Move to 2 claim intervals ahead
            await mineBlocks(web3, claimIntervalBlocks+claimIntervalBlocks);
            // Attempt claim in the next interval with new inflation rate
            await rewardsClaimTrustedNode(registeredNodeTrusted4, {
                from: registeredNodeTrusted4,
            }, claimPercChange);           
        });
        

        
        
    });
}
