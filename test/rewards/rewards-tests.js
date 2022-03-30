import { getCurrentTime, increaseTime } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { submitPrices } from '../_helpers/network';
import {
    registerNode,
    setNodeTrusted,
    setNodeWithdrawalAddress,
    nodeStakeRPL,
    getNodeRPLStake,
    getNodeEffectiveRPLStake,
    getNodeMinimumRPLStake,
    getCalculatedTotalEffectiveRPLStake
} from '../_helpers/node'
import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsNode, RocketMerkleDistributorMainnet, RocketSmoothingPool,
} from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting, setRewardsClaimIntervalTime, setRPLInflationStartTime } from '../dao/scenario-dao-protocol-bootstrap'
import { mintRPL } from '../_helpers/tokens';
import { rewardsClaimersPercTotalGet } from './scenario-rewards-claim';
import { setDAONetworkBootstrapRewardsClaimer, spendRewardsClaimTreasury, setRPLInflationIntervalRate } from '../dao/scenario-dao-protocol-bootstrap';

// Contracts
import { RocketRewardsPool } from '../_utils/artifacts';
import { createMinipool, stakeMinipool } from '../_helpers/minipool'
import { userDeposit } from '../_helpers/deposit'
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { upgradeOneDotOne } from '../_utils/upgrade'
import { submitRewards } from './scenario-submit-rewards';
import { claimRewards } from './scenario-claim-rewards';
import { claimAndStakeRewards } from './scenario-claim-and-stake-rewards';
import { parseRewardsMap } from '../_utils/merkle-tree';


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
            // Upgrade
            await upgradeOneDotOne(owner);

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
       
                        
        /*** Regular Nodes *************************/

        
        it(printTitle('node', 'can claim RPL and ETH'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Send ETH to rewards pool
            const rocketSmoothingPool = await RocketSmoothingPool.deployed();
            await web3.eth.sendTransaction({ from: owner, to: rocketSmoothingPool.address, value: web3.utils.toWei('2', 'ether')});

            const rocketRewardsPool = await RocketRewardsPool.deployed();
            const pendingRewards = await rocketRewardsPool.getPendingETHRewards.call();

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    amountRPL: web3.utils.toWei('1', 'ether'),
                    amountETH: web3.utils.toWei('0', 'ether')
                },
                {
                    address: registeredNode2,
                    network: 0,
                    amountRPL: web3.utils.toWei('2', 'ether'),
                    amountETH: web3.utils.toWei('1', 'ether')
                }
            ]
            await submitRewards(0, rewards, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimRewards([0], [rewards], {
                from: registeredNode1,
            });
            await claimRewards([0], [rewards], {
                from: registeredNode2,
            });

            // Do a second claim interval
            await submitRewards(1, rewards, {from: registeredNodeTrusted1});
            await submitRewards(1, rewards, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimRewards([1], [rewards], {
                from: registeredNode1,
            });
            await claimRewards([1], [rewards], {
                from: registeredNode2,
            });
        });


        it(printTitle('node', 'can not claim with invalid proof'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    amountRPL: web3.utils.toWei('1', 'ether'),
                    amountETH: web3.utils.toWei('0', 'ether'),
                },
            ]

            // Create 3 snapshots
            await submitRewards(0, rewards, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, {from: registeredNodeTrusted2});

            let treeData = parseRewardsMap(rewards);
            let proof = treeData.proof.claims[web3.utils.toChecksumAddress(registeredNode1)];
            let amountsRPL = [proof.amountRPL];
            let amountsETH = [proof.amountETH];
            let proofs = [proof.proof];

            let rocketMerkleDistributorMainnet = await RocketMerkleDistributorMainnet.deployed();

            // Attempt to claim reward for registeredNode1 with registeredNode2
            await shouldRevert(rocketMerkleDistributorMainnet.claim([0], amountsRPL, amountsETH, proofs, {from: registeredNode2}), 'Was able to claim with invalid proof', 'Invalid proof');
        });


        it(printTitle('node', 'can not claim same interval twice'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    amountRPL: web3.utils.toWei('1', 'ether'),
                    amountETH: web3.utils.toWei('0', 'ether'),
                },
            ]

            // Create 3 snapshots
            await submitRewards(0, rewards, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, {from: registeredNodeTrusted2});
            await submitRewards(1, rewards, {from: registeredNodeTrusted1});
            await submitRewards(1, rewards, {from: registeredNodeTrusted2});
            await submitRewards(2, rewards, {from: registeredNodeTrusted1});
            await submitRewards(2, rewards, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimRewards([0, 1], [rewards, rewards], {
                from: registeredNode1,
            });
            await shouldRevert(claimRewards([0], [rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
            await shouldRevert(claimRewards([1], [rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
            await shouldRevert(claimRewards([0, 1], [rewards, rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
            await shouldRevert(claimRewards([0, 2], [rewards, rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
        });


        it(printTitle('node', 'can claim mulitiple periods in a single tx'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    amountRPL: web3.utils.toWei('1', 'ether'),
                    amountETH: web3.utils.toWei('0', 'ether'),
                },
                {
                    address: registeredNode2,
                    network: 0,
                    amountRPL: web3.utils.toWei('2', 'ether'),
                    amountETH: web3.utils.toWei('0', 'ether'),
                }
            ]

            // Submit 2 snapshots
            await submitRewards(0, rewards, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, {from: registeredNodeTrusted2});
            await submitRewards(1, rewards, {from: registeredNodeTrusted1});
            await submitRewards(1, rewards, {from: registeredNodeTrusted2});
            await submitRewards(2, rewards, {from: registeredNodeTrusted1});
            await submitRewards(2, rewards, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimRewards([0], [rewards], {
                from: registeredNode1,
            });
            await claimRewards([1, 2], [rewards, rewards], {
                from: registeredNode1,
            });
            await claimRewards([0, 1, 2], [rewards, rewards, rewards], {
                from: registeredNode2,
            });
        });


        it(printTitle('node', 'can claim RPL and stake'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    amountRPL: web3.utils.toWei('1', 'ether'),
                    amountETH: web3.utils.toWei('0', 'ether'),
                },
                {
                    address: registeredNode2,
                    network: 0,
                    amountRPL: web3.utils.toWei('2', 'ether'),
                    amountETH: web3.utils.toWei('0', 'ether'),
                }
            ]
            await submitRewards(0, rewards, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimAndStakeRewards([0], [rewards], web3.utils.toWei('1', 'ether'), {
                from: registeredNode1,
            });
            await claimAndStakeRewards([0], [rewards], web3.utils.toWei('2', 'ether'), {
                from: registeredNode2,
            });

            // Do a second claim interval
            await submitRewards(1, rewards, {from: registeredNodeTrusted1});
            await submitRewards(1, rewards, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimAndStakeRewards([1], [rewards], web3.utils.toWei('0.5', 'ether'), {
                from: registeredNode1,
            });
            await claimAndStakeRewards([1], [rewards], web3.utils.toWei('1', 'ether'), {
                from: registeredNode2,
            });
        });


        it(printTitle('node', 'can not stake amount greater than claim'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    amountRPL: web3.utils.toWei('1', 'ether'),
                    amountETH: web3.utils.toWei('0', 'ether'),
                },
            ]
            await submitRewards(0, rewards, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, {from: registeredNodeTrusted2});

            // Claim RPL
            await shouldRevert(claimAndStakeRewards([0], [rewards], web3.utils.toWei('2', 'ether'), {
                from: registeredNode1,
            }), 'Was able to stake amount greater than reward', 'Invalid stake amount');
        });


        it(printTitle('node', 'can claim RPL and stake multiple snapshots'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('rocketClaimNode', 0.5);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    amountRPL: web3.utils.toWei('1', 'ether'),
                    amountETH: web3.utils.toWei('0', 'ether'),
                }
            ]
            await submitRewards(0, rewards, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, {from: registeredNodeTrusted2});
            await submitRewards(1, rewards, {from: registeredNodeTrusted1});
            await submitRewards(1, rewards, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimAndStakeRewards([0, 1], [rewards, rewards], web3.utils.toWei('2', 'ether'), {
                from: registeredNode1,
            });
        });
    });
}
