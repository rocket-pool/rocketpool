import { getCurrentTime, increaseTime } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
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
    RocketDAOProtocolSettingsNode,
    RocketMerkleDistributorMainnet,
    RocketSmoothingPool,
    RocketStorage,
} from '../_utils/artifacts';
import {
    setDAONetworkBootstrapRewardsClaimers,
    setDAOProtocolBootstrapSetting,
    setRewardsClaimIntervalTime,
    setRPLInflationStartTime,
} from '../dao/scenario-dao-protocol-bootstrap';
import { mintRPL } from '../_helpers/tokens';
import { setRPLInflationIntervalRate } from '../dao/scenario-dao-protocol-bootstrap';

// Contracts
import { RocketRewardsPool } from '../_utils/artifacts';
import { createMinipool, stakeMinipool } from '../_helpers/minipool'
import { userDeposit } from '../_helpers/deposit'
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { executeRewards, submitRewards } from './scenario-submit-rewards';
import { claimRewards } from './scenario-claim-rewards';
import { claimAndStakeRewards } from './scenario-claim-and-stake-rewards';
import { parseRewardsMap } from '../_utils/merkle-tree';
import { daoNodeTrustedExecute, daoNodeTrustedPropose, daoNodeTrustedVote } from '../dao/scenario-dao-node-trusted';
import { getDAOProposalStartTime } from '../dao/scenario-dao-proposal';
import { assertBN } from '../_helpers/bn';
import { upgradeOneDotThree } from '../_utils/upgrade';


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
            unregisteredNodeTrusted1,
            unregisteredNodeTrusted2,
            node1WithdrawalAddress,
            random
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
            assert.isAbove(claimIntervalTime, ONE_DAY, 'Tests will not function correctly unless claimIntervalTime is greater than inflation period (1 day)')

            // Return the starting time for inflation when it will be available
            return timeStart + ONE_DAY;
        }

        // Set a rewards claiming contract
        let rewardsContractSetup = async function(_trustedNodePerc, _protocolPerc, _nodePerc, _claimAmountPerc) {
            // Set the amount this contract can claim
            await setDAONetworkBootstrapRewardsClaimers(_trustedNodePerc, _protocolPerc, _nodePerc, { from: owner });
            // Set the claim interval blocks
            await setRewardsClaimIntervalTime(claimIntervalTime, { from: owner });
        }

        async function kickTrustedNode(nodeAddress, voters) {
            // Encode the calldata for the proposal
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
              {name: 'proposalKick', type: 'function', inputs: [{type: 'address', name: '_nodeAddress'}, {type: 'uint256', name: '_rplFine'}]},
              [nodeAddress, '0']
            );
            // Add the proposal
            let proposalID = await daoNodeTrustedPropose(`Kick ${nodeAddress}`, proposalCalldata, {
                from: registeredNodeTrusted1
            });
            // Current time
            let timeCurrent = await getCurrentTime(web3);
            // Now increase time until the proposal is 'active' and can be voted on
            await increaseTime(web3, (await getDAOProposalStartTime(proposalID)-timeCurrent)+2);
            // Now lets vote
            for (const voter of voters) {
                await daoNodeTrustedVote(proposalID, true, { from: voter });
            }
            // Proposal has passed, lets execute it now
            await daoNodeTrustedExecute(proposalID, { from: registeredNode1 });
        }


        // Setup
        before(async () => {
            await upgradeOneDotThree();

            let slotTimestamp = '1600000000';

            // Set settings
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});

            // Register nodes
            await registerNode({from: registeredNode1});
            await registerNode({from: registeredNode2});
            await registerNode({from: registeredNodeTrusted1});
            await registerNode({from: registeredNodeTrusted2});
            await registerNode({from: unregisteredNodeTrusted1});
            await registerNode({from: unregisteredNodeTrusted2});

            // Set node 1 withdrawal address
            await setNodeWithdrawalAddress(registeredNode1, node1WithdrawalAddress, {from: registeredNode1});

            // Set nodes as trusted
            await setNodeTrusted(registeredNodeTrusted1, 'saas_1', 'node@home.com', owner);
            await setNodeTrusted(registeredNodeTrusted2, 'saas_2', 'node@home.com', owner);

            // Set max per-minipool stake to 100% and RPL price to 1 ether
            const block = await web3.eth.getBlockNumber();
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.per.minipool.stake.maximum', '1'.ether, {from: owner});
            await submitPrices(block, slotTimestamp, '1'.ether, {from: registeredNodeTrusted1});
            await submitPrices(block, slotTimestamp, '1'.ether, {from: registeredNodeTrusted2});

            // Mint and stake RPL
            await mintRPL(owner, registeredNode1, '32'.ether);
            await mintRPL(owner, registeredNode2, '32'.ether);
            await nodeStakeRPL('32'.ether, {from: registeredNode1});
            await nodeStakeRPL('32'.ether, {from: registeredNode2});

            // User deposits
            await userDeposit({from: userOne, value: '48'.ether});

            // Create minipools
            let minipool1 = await createMinipool({from: registeredNode1, value: '16'.ether});
            let minipool2 = await createMinipool({from: registeredNode2, value: '16'.ether});
            let minipool3 = await createMinipool({from: registeredNode2, value: '16'.ether});

            // Wait required scrub period
            await increaseTime(web3, scrubPeriod + 1);

            // Stake minipools
            await stakeMinipool(minipool1, {from: registeredNode1});
            await stakeMinipool(minipool2, {from: registeredNode2});
            await stakeMinipool(minipool3, {from: registeredNode2});

            // Check node effective stakes
            let node1EffectiveStake = await getNodeEffectiveRPLStake(registeredNode1);
            let node2EffectiveStake = await getNodeEffectiveRPLStake(registeredNode2);
            assertBN.equal(node1EffectiveStake, '16'.ether, 'Incorrect node 1 effective stake');
            assertBN.equal(node2EffectiveStake, '32'.ether, 'Incorrect node 2 effective stake');
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
            await shouldRevert(setDAONetworkBootstrapRewardsClaimers('0.1'.ether, '0.5'.ether, '0.4'.ether, {
                from: userOne,
            }), 'Non owner set contract claimer percentage for rewards');
        });


        it(printTitle('guardian', 'set contract claimer percentage for rewards, then update it'), async () => {
            // Set the amount this contract can claim
            await setDAONetworkBootstrapRewardsClaimers('0.1'.ether, '0.1'.ether, '0.8'.ether,  {
                from: owner,
            });
        });


        it(printTitle('guardian', 'fails to set contract claimer percentages to lower than 100% total'), async () => {
            // Set the amount this contract can claim
            await shouldRevert(setDAONetworkBootstrapRewardsClaimers('0.1'.ether, '0.1'.ether, '0.1'.ether,  {
                from: owner,
            }), 'Percentages were updated', 'Total does not equal 100%');
        });


        it(printTitle('guardian', 'fails to set contract claimer percentages to greater than 100% total'), async () => {
            // Set the amount this contract can claim
            await shouldRevert(setDAONetworkBootstrapRewardsClaimers('0.4'.ether, '0.4'.ether, '0.4'.ether,  {
                from: owner,
            }), 'Percentages were updated', 'Total does not equal 100%');
        });


        /*** Regular Nodes *************************/


        it(printTitle('node', 'can claim RPL and ETH'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Send ETH to rewards pool
            const rocketSmoothingPool = await RocketSmoothingPool.deployed();
            await web3.eth.sendTransaction({ from: owner, to: rocketSmoothingPool.address, value: '20'.ether});

            const rocketRewardsPool = await RocketRewardsPool.deployed();
            const pendingRewards = await rocketRewardsPool.getPendingETHRewards.call();

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                },
                {
                    address: registeredNode2,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '2'.ether,
                    nodeETH: '1'.ether
                },
                {
                    address: registeredNodeTrusted1,
                    network: 0,
                    trustedNodeRPL: '1'.ether,
                    nodeRPL: '2'.ether,
                    nodeETH: '0'.ether
                },
                {
                    address: userOne,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1.333'.ether,
                    nodeETH: '0.3'.ether
                },
            ]
            await submitRewards(0, rewards, '0'.ether, '2'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '2'.ether, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimRewards(registeredNode1, [0], [rewards], {
                from: registeredNode1,
            });
            await claimRewards(registeredNode2, [0], [rewards], {
                from: registeredNode2,
            });
            await claimRewards(registeredNodeTrusted1, [0], [rewards], {
                from: registeredNodeTrusted1,
            });
            await claimRewards(userOne, [0], [rewards], {
                from: userOne,
            });

            // Do a second claim interval
            await submitRewards(1, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(1, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimRewards(registeredNode1, [1], [rewards], {
                from: registeredNode1,
            });
            await claimRewards(registeredNode2, [1], [rewards], {
                from: registeredNode2,
            });
        });


        it(printTitle('node', 'can claim from withdrawal address'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Send ETH to rewards pool
            const rocketSmoothingPool = await RocketSmoothingPool.deployed();
            await web3.eth.sendTransaction({ from: owner, to: rocketSmoothingPool.address, value: '20'.ether});

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                }
            ]
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimRewards(registeredNode1, [0], [rewards], {
                from: node1WithdrawalAddress,
            });
        });


        it(printTitle('node', 'can not claim with invalid proof'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                },
            ]

            // Create 3 snapshots
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            let treeData = parseRewardsMap(rewards);
            let proof = treeData.proof.claims[web3.utils.toChecksumAddress(registeredNode1)];
            let amountsRPL = [proof.amountRPL];
            let amountsETH = [proof.amountETH];
            let proofs = [proof.proof];

            let rocketMerkleDistributorMainnet = await RocketMerkleDistributorMainnet.deployed();

            // Attempt to claim reward for registeredNode1 with registeredNode2
            await shouldRevert(rocketMerkleDistributorMainnet.claim(registeredNode2, [0], amountsRPL, amountsETH, proofs, {from: registeredNode2}), 'Was able to claim with invalid proof', 'Invalid proof');
        });


        it(printTitle('node', 'can not claim same interval twice'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                },
            ]

            // Create 3 snapshots
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});
            await submitRewards(1, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(1, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});
            await submitRewards(2, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(2, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimRewards(registeredNode1, [0, 1], [rewards, rewards], {
                from: registeredNode1,
            });
            await shouldRevert(claimRewards(registeredNode1, [0], [rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
            await shouldRevert(claimRewards(registeredNode1, [1], [rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
            await shouldRevert(claimRewards(registeredNode1, [0, 1], [rewards, rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
            await shouldRevert(claimRewards(registeredNode1, [0, 2], [rewards, rewards], {
                from: registeredNode1,
            }), 'Was able to claim again', 'Already claimed');
        });


        it(printTitle('node', 'can claim mulitiple periods in a single tx'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                },
                {
                    address: registeredNode2,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '2'.ether,
                    nodeETH: '0'.ether
                }
            ]

            // Submit 2 snapshots
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});
            await submitRewards(1, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(1, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});
            await submitRewards(2, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(2, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimRewards(registeredNode1, [0], [rewards], {
                from: registeredNode1,
            });
            await claimRewards(registeredNode1, [1, 2], [rewards, rewards], {
                from: registeredNode1,
            });
            await claimRewards(registeredNode2, [0, 1, 2], [rewards, rewards, rewards], {
                from: registeredNode2,
            });
        });


        it(printTitle('node', 'can claim RPL and stake'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                },
                {
                    address: registeredNode2,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '2'.ether,
                    nodeETH: '0'.ether
                }
            ]
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimAndStakeRewards(registeredNode1, [0], [rewards], '1'.ether, {
                from: registeredNode1,
            });
            await claimAndStakeRewards(registeredNode2, [0], [rewards], '2'.ether, {
                from: registeredNode2,
            });

            // Do a second claim interval
            await submitRewards(1, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(1, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimAndStakeRewards(registeredNode1, [1], [rewards], '0.5'.ether, {
                from: registeredNode1,
            });
            await claimAndStakeRewards(registeredNode2, [1], [rewards], '1'.ether, {
                from: registeredNode2,
            });
        });


        it(printTitle('node', 'can not stake amount greater than claim'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                },
            ]
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            // Claim RPL
            await shouldRevert(claimAndStakeRewards(registeredNode1, [0], [rewards], '2'.ether, {
                from: registeredNode1,
            }), 'Was able to stake amount greater than reward', 'Invalid stake amount');
        });


        it(printTitle('node', 'can claim RPL and stake multiple snapshots'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                }
            ]
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});
            await submitRewards(1, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(1, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            // Claim RPL
            await claimAndStakeRewards(registeredNode1, [0, 1], [rewards, rewards], '2'.ether, {
                from: registeredNode1,
            });
        });


        /*** Random *************************/


        it(printTitle('random', 'can execute reward period if consensus is reached'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Add another 2 trusted nodes so consensus becomes 3 votes
            await setNodeTrusted(unregisteredNodeTrusted1, 'saas_3', 'node@home.com', owner);
            await setNodeTrusted(unregisteredNodeTrusted2, 'saas_4', 'node@home.com', owner);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                },
            ]

            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            // Kick a trusted node so consensus becomes 2 votes again
            await kickTrustedNode(unregisteredNodeTrusted1, [registeredNodeTrusted1, registeredNodeTrusted2, unregisteredNodeTrusted1]);

            // Now we should be able to execute the reward period
            await executeRewards(0, rewards, '0'.ether, '0'.ether, {from: random});
        });

        it(printTitle('random', 'cant execute reward period twice'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Add another 2 trusted nodes so consensus becomes 3 votes
            await setNodeTrusted(unregisteredNodeTrusted1, 'saas_3', 'node@home.com', owner);
            await setNodeTrusted(unregisteredNodeTrusted2, 'saas_4', 'node@home.com', owner);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                },
            ]

            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});

            // Kick a trusted node so consensus becomes 2 votes again
            await kickTrustedNode(unregisteredNodeTrusted1, [registeredNodeTrusted1, registeredNodeTrusted2, unregisteredNodeTrusted1]);

            // Now we should be able to execute the reward period
            await executeRewards(0, rewards, '0'.ether, '0'.ether, {from: random});
            await shouldRevert(executeRewards(0, rewards, '0'.ether, '0'.ether, {from: random}), 'Already executed');
        });

        it(printTitle('random', 'can submit past consensus'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Add another trusted node 
            await setNodeTrusted(unregisteredNodeTrusted1, 'saas_3', 'node@home.com', owner);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                },
            ]

            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});
            // already have consensus, should have executed
            await shouldRevert(executeRewards(0, rewards, '0'.ether, '0'.ether, {from: random}), 'Already executed');
            
            // should allow another vote past consensus
            await submitRewards(0, rewards, '0'.ether, '0'.ether, {from: unregisteredNodeTrusted1});

        });


        /*** Misc *************************/


        it(printTitle('misc', 'claim bitmap is correct'), async () => {
            // Initialize RPL inflation & claims contract
            let rplInflationStartTime = await rplInflationSetup();
            await rewardsContractSetup('0.5'.ether, '0'.ether, '0.5'.ether);

            // Move to inflation start plus one claim interval
            let currentTime = await getCurrentTime(web3);
            assert.isBelow(currentTime, rplInflationStartTime, 'Current block should be below RPL inflation start time');
            await increaseTime(web3, rplInflationStartTime - currentTime + claimIntervalTime);

            // Submit rewards snapshot
            const rewards = [
                {
                    address: registeredNode1,
                    network: 0,
                    trustedNodeRPL: '0'.ether,
                    nodeRPL: '1'.ether,
                    nodeETH: '0'.ether
                },
            ]

            // Submit 10 reward intervals
            for (let i = 0; i < 10; i++) {
                await submitRewards(i, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted1});
                await submitRewards(i, rewards, '0'.ether, '0'.ether, {from: registeredNodeTrusted2});
            }

            // Some arbitrary intervals to claim
            let claimIntervals = [ 0, 4, 6, 9 ];

            await claimRewards(registeredNode1, claimIntervals, Array(claimIntervals.length).fill(rewards), {
              from: registeredNode1,
            });

            // Retrieve the bitmap of claims
            const rocketStorage = await RocketStorage.deployed();
            const key = web3.utils.soliditySha3(
                {type: 'string', value: 'rewards.interval.claimed'},
                {type: 'address', value: registeredNode1},
                {type: 'uint256', value: 0}
            )
            const bitmap = (await rocketStorage.getUint.call(key)).toNumber();

            // Construct the expected bitmap and compare
            let expected = 0;
            for (let i = 0; i < claimIntervals.length; i++) {
                expected |= 1 << claimIntervals[i];
            }
            assert.strictEqual(bitmap, expected, 'Incorrect claimed bitmap');

            // Confirm second claim fails for each interval
            for (let i = 0; i < claimIntervals.length; i++) {
                await shouldRevert(claimRewards(registeredNode1, [claimIntervals[i]], [rewards], {
                    from: registeredNode1,
                }), 'Was able to claim again', 'Already claimed');
            }
        });
    });
}
