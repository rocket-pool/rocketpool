import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode } from '../_helpers/node';
import { setNodeTrusted } from '../node/scenario-set-trusted';
import { getRewardsClaimIntervalBlocks, getRewardsClaimersPercTotal, setRewardsClaimIntervalBlocks, setRewardsClaimerPerc } from './scenario-rewards-claim';
import { rewardsClaimNode } from './scenario-rewards-claim-node';

// Contracts
import { RocketRole, RocketRewardsClaimNode } from '../_utils/artifacts';


export default function() {
    contract.only('RocketRewards', async (accounts) => {


        // Accounts
        const [
            owner,
            userOne,
            userTwo,
            registeredNode,
            registeredNodeTrusted
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        before(async () => {

            // Register nodes
            await registerNode({from: registeredNode});
            await registerNode({from: registeredNodeTrusted});
            // Enable last node to be trusted
            await setNodeTrusted(registeredNodeTrusted, true, {from: owner});
            

        });

        it(printTitle('userOne', 'fails to set interval blocks for rewards claim period'), async () => {
            // Set the rewards claims interval in blocks
            await shouldRevert(setRewardsClaimIntervalBlocks(100, {
                from: userOne,
            }), 'Non owner set interval blocks for rewards claim period');
        });

        it(printTitle('owner', 'succeeds setting interval blocks for rewards claim period'), async () => {
            // Set the rewards claims interval in blocks
            await setRewardsClaimIntervalBlocks(100, {
                from: owner,
            });
        });

        
        it(printTitle('userOne', 'fails to set contract claimer percentage for rewards'), async () => {
            // Set the amount this contract can claim
            await shouldRevert(setRewardsClaimerPerc('myHackerContract', web3.utils.toWei('0.1', 'ether'), {
                from: userOne,
            }), 'Non owner set contract claimer percentage for rewards');
        });


        it(printTitle('owner', 'set contract claimer percentage for rewards, then update it'), async () => {
            // Set the amount this contract can claim
            await setRewardsClaimerPerc('rocketPoolClaimer2', web3.utils.toWei('0.0001', 'ether'), {
                from: owner,
            });
            // Set the amount this contract can claim, then update it
            await setRewardsClaimerPerc('rocketPoolClaimer1', web3.utils.toWei('0.01', 'ether'), {
                from: owner,
            });
            // Update now
            await setRewardsClaimerPerc('rocketPoolClaimer1', web3.utils.toWei('0.02', 'ether'), {
                from: owner,
            });
        });

        it(printTitle('owner', 'set contract claimer percentage for rewards, then update it to zero'), async () => {
            // Get the total current claims amounts
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await getRewardsClaimersPercTotal()));
            // Set the amount this contract can claim, then update it
            await setRewardsClaimerPerc('rocketPoolClaimer1', web3.utils.toWei('0.01', 'ether'), {
                from: owner,
            });
            // Update now
            await setRewardsClaimerPerc('rocketPoolClaimer1', web3.utils.toWei('0', 'ether'), {
                from: owner,
            }, totalClaimersPerc);
        });

        it(printTitle('owner', 'set contract claimers total percentage to 100%'), async () => {
            // Get the total current claims amounts
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await getRewardsClaimersPercTotal()));
            // Get the total % needed to make 100%
            let claimAmount = (1 - totalClaimersPerc).toFixed(4);
            // Set the amount this contract can claim and expect total claimers amount to equal 1 ether (100%)
            await setRewardsClaimerPerc('rocketPoolClaimer1', web3.utils.toWei(claimAmount.toString(), 'ether'), {
                from: owner,
            }, 1);
        });

        it(printTitle('owner', 'fail to set contract claimers total percentage over 100%'), async () => {
            // Get the total current claims amounts
            let totalClaimersPerc = parseFloat(web3.utils.fromWei(await getRewardsClaimersPercTotal()));
            // Get the total % needed to make 100%
            let claimAmount = ((1 - totalClaimersPerc) + 0.001).toFixed(4); 
            // Set the amount this contract can claim and expect total claimers amount to equal 1 ether (100%)
            await shouldRevert(setRewardsClaimerPerc('rocketPoolClaimer1', web3.utils.toWei(claimAmount.toString(), 'ether'), {
                from: owner,
            }), "Total claimers percentrage over 100%");
        });

        /*
        it(printTitle('owner', 'set multiple contract claimer percentages for rewards under 100%'), async () => {
            // Set the amount this contract can claim
            await setRewardsClaimerPerc('rocketPoolClaimer1', web3.utils.toWei('0.5', 'ether'), {
                from: owner,
            });
            // Set the amount this contract can claim
            await setRewardsClaimerPerc('rocketPoolClaimer2', web3.utils.toWei('0.49', 'ether'), {
                from: owner,
            });
        });

        /*
        it(printTitle('nodeRegistered', 'fails to claim before a claim '), async () => {
            // Rocket Node Contract (Trusted Nodes + Minipool claims)
            const rocketRewardsClaimNode = await RocketRewardsClaimNode.deployed();
            // Rewards interval blocks
            let rewardsIntervalBlocks = 5;
            // Set the rewards claims interval in blocks
            await setRewardsClaimIntervalBlocks(rewardsIntervalBlocks, {
                from: owner,
            });
            // Current block
            let currentBlock = await web3.eth.getBlockNumber();
            // Fast forward blocks
            await mineBlocks(web3, rewardsIntervalBlocks-2);
        });
        */


        
        /*
        it(printTitle('userTwo', 'cannot make a claim on rewards as they are not a permitted contract'), async () => {
            
            // Burn existing fixed supply RPL for new RPL
            await shouldRevert(rewardsClaim({
                from: userTwo,
            }), 'Claim rewards when they should not be able too');

        });*/


    });
}
