import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode } from '../_helpers/node';
import { setNodeTrusted } from '../node/scenario-set-trusted';
import { rewardsClaimIntervalBlocksSet, rewardsClaimerPercSet } from './scenario-rewards-claim';
import { rplInflationIntervalRateSet, rplInflationIntervalBlocksSet, rplInflationStartBlockSet, rplClaimInflation } from '../token/scenario-rpl-inflation';
import { rewardsClaimTrustedNode } from './scenario-rewards-claim-node';

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
            registeredNodeTrusted3
        ] = accounts;

        // Set some RPL inflation scenes
        let rplInflationSetup = async function() {
            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();

            let config = {
                blockInterval: 10,
                blockStart: blockCurrent+3,
                yearlyInflationTarget: 0.05
            }

            // Set the daily inflation start block
            await rplInflationStartBlockSet(config.blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(config.blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(config.yearlyInflationTarget, { from: owner });
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
            // Enable last node to be trusted
            await setNodeTrusted(registeredNodeTrusted1, true, {from: owner});
            await setNodeTrusted(registeredNodeTrusted2, true, {from: owner});
            await setNodeTrusted(registeredNodeTrusted3, true, {from: owner});
            

        });

        /*

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
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await getRewardsClaimersPercTotal()));
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
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await getRewardsClaimersPercTotal()));
            // Get the total % needed to make 100%
            let claimAmount = (1 - totalClaimersPerc).toFixed(4);
            // Set the amount this contract can claim and expect total claimers amount to equal 1 ether (100%)
            await rewardsClaimerPercSet('rocketPoolClaimer1', web3.utils.toWei(claimAmount.toString(), 'ether'), {
                from: owner,
            }, 1);
        });

        it(printTitle('owner', 'fail to set contract claimers total percentage over 100%'), async () => {
            // Get the total current claims amounts
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await getRewardsClaimersPercTotal()));
            // Get the total % needed to make 100%
            let claimAmount = ((1 - totalClaimersPerc) + 0.001).toFixed(4); 
            // Set the amount this contract can claim and expect total claimers amount to equal 1 ether (100%)
            await shouldRevert(rewardsClaimerPercSet('rocketPoolClaimer1', web3.utils.toWei(claimAmount.toString(), 'ether'), {
                from: owner,
            }), "Total claimers percentrage over 100%");
        });

        /*
        it(printTitle('owner', 'set multiple contract claimer percentages for rewards under 100%'), async () => {
            // Set the amount this contract can claim
            await rewardsClaimerPercSet('rocketPoolClaimer1', web3.utils.toWei('0.5', 'ether'), {
                from: owner,
            });
            // Set the amount this contract can claim
            await rewardsClaimerPercSet('rocketPoolClaimer2', web3.utils.toWei('0.49', 'ether'), {
                from: owner,
            });
        });
        
        it(printTitle('userOne', 'fails to call claim method on rewards pool contract as they are not a registered claimer contract'), async () => {
            // Init rewards pool
            const rocketRewardsPool = await RocketRewardsPool.deployed();
            // Try to call the claim method
            await shouldRevert(rocketRewardsPool.claim(userOne, {
                from: userOne
            }), "Non claimer network contract called claim method");
        });
        */
        
       it(printTitle('nodeTrusted', 'fails to call claim method on rewards pool contract as they are not a registered claimer'), async () => {

            // Setup RPL inflation for occuring every 10 blocks at 5%
            await rplInflationSetup();

            // Rewards interval blocks
            let claimAmountPerc = 0.30;
            let claimIntervalBlocks = 15;
            let claimContact = 'rocketClaimTrustedNode';

            // Set the amount this contract can claim
            await rewardsClaimerPercSet(claimContact, web3.utils.toWei(claimAmountPerc.toString(), 'ether'), {
                from: owner,
            });
            // Set the claim interval blocks
            await rewardsClaimIntervalBlocksSet(claimIntervalBlocks, {
                from: owner,
            });
            // Fast forward blocks
            await mineBlocks(web3, claimIntervalBlocks);
            // Claim from the contract now
            await rewardsClaimTrustedNode(claimIntervalBlocks, {
                from: registeredNodeTrusted1,
            });

        });

        
        /*

        it(printTitle('userOne', 'fails to call claim method on rewards pool contract as they are not a registered claimer'), async () => {
            // Rocket Node Contract (Trusted Nodes + Minipool claims)
            const rocketRewardsClaimNode = await RocketRewardsClaimNode.deployed();
            // Rewards interval blocks
            let rewardsIntervalBlocks = 5;
            // Set the rewards claims interval in blocks
            await rewardsClaimIntervalBlocksSet(rewardsIntervalBlocks, {
                from: userOne,
            });
            // Current block
            let currentBlock = await web3.eth.getBlockNumber();
            // Fast forward blocks
            await mineBlocks(web3, rewardsIntervalBlocks-2);
        });

        it(printTitle('userTwo', 'cannot make a claim on rewards as they are not a permitted contract'), async () => {
            
            // Burn existing fixed supply RPL for new RPL
            await shouldRevert(rewardsClaim({
                from: userTwo,
            }), 'Claim rewards when they should not be able too');

        });*/


    });
}
