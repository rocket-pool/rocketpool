import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketNodeStaking,
} from '../_utils/artifacts';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, nodeStakeRPL, nodeDeposit, setNodeTrusted } from '../_helpers/node'
import { mintRPL, approveRPL } from '../_helpers/tokens';
import { stakeRpl } from './scenario-stake-rpl';
import { withdrawRpl } from './scenario-withdraw-rpl';
import { createMinipool, stakeMinipool } from '../_helpers/minipool'
import { beginUserDistribute, withdrawValidatorBalance } from '../minipool/scenario-withdraw-validator-balance';
import { userDeposit } from '../_helpers/deposit'
import { increaseTime } from '../_utils/evm'
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { upgradeOneDotTwo } from '../_utils/upgrade';
import { setRewardsClaimIntervalTime } from '../dao/scenario-dao-protocol-bootstrap';

export default function() {
    contract('RocketNodeStaking', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
            random,
        ] = accounts;

        let scrubPeriod = (60 * 60 * 24); // 24 hours

        // Setup
        let rocketNodeStaking;
        before(async () => {
            await upgradeOneDotTwo(owner);

            // Load contracts
            rocketNodeStaking = await RocketNodeStaking.deployed();

            // Set settings
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node1@home.com', owner);

            // Mint RPL to accounts
            const rplAmount = web3.utils.toWei('10000', 'ether');
            await mintRPL(owner, node, rplAmount);
            await mintRPL(owner, random, rplAmount);

        });


        it(printTitle('node operator', 'can stake RPL'), async () => {

            // Set parameters
            const rplAmount = web3.utils.toWei('5000', 'ether');

            // Approve transfer & stake RPL once
            await approveRPL(rocketNodeStaking.address, rplAmount, {from: node});
            await stakeRpl(rplAmount, {
                from: node,
            });

            // Make node deposit / create minipool
            await nodeDeposit({from: node, value: web3.utils.toWei('16', 'ether')});

            // Approve transfer & stake RPL twice
            await approveRPL(rocketNodeStaking.address, rplAmount, {from: node});
            await stakeRpl(rplAmount, {
                from: node,
            });

        });


        it(printTitle('random address', 'cannot stake RPL'), async () => {

            // Set parameters
            const rplAmount = web3.utils.toWei('10000', 'ether');

            // Approve transfer & attempt to stake RPL
            await approveRPL(rocketNodeStaking.address, rplAmount, {from: node});
            await shouldRevert(stakeRpl(rplAmount, {
                from: random,
            }), 'Random address staked RPL');

        });


        it(printTitle('node operator', 'can withdraw staked RPL'), async () => {

            // Set parameters
            const rplAmount = web3.utils.toWei('10000', 'ether');

            // Remove withdrawal cooldown period
            await setRewardsClaimIntervalTime(0, {from: owner});

            // Stake RPL
            await nodeStakeRPL(rplAmount, {from: node});

            // Withdraw staked RPL
            await withdrawRpl(rplAmount, {
                from: node,
            });

        });


        it(printTitle('node operator', 'cannot withdraw staked RPL during the cooldown period'), async () => {

            // Set parameters
            const rplAmount = web3.utils.toWei('10000', 'ether');

            // Stake RPL
            await nodeStakeRPL(rplAmount, {from: node});

            // Withdraw staked RPL
            await shouldRevert(withdrawRpl(rplAmount, {
                from: node,
            }), 'Withdrew staked RPL during the cooldown period');

        });


        it(printTitle('node operator', 'cannot withdraw more RPL than they have staked'), async () => {

            // Set parameters
            const stakeAmount = web3.utils.toWei('10000', 'ether');
            const withdrawAmount = web3.utils.toWei('20000', 'ether');

            // Remove withdrawal cooldown period
            await setRewardsClaimIntervalTime(0, {from: owner});

            // Stake RPL
            await nodeStakeRPL(stakeAmount, {from: node});

            // Withdraw staked RPL
            await shouldRevert(withdrawRpl(withdrawAmount, {
                from: node,
            }), 'Withdrew more RPL than was staked');

        });


        it(printTitle('node operator', 'cannot withdraw RPL leaving the node undercollateralised'), async () => {

            // Set parameters
            const rplAmount = web3.utils.toWei('10000', 'ether');

            // Remove withdrawal cooldown period
            await setRewardsClaimIntervalTime(0, {from: owner});

            // Stake RPL
            await nodeStakeRPL(rplAmount, {from: node});

            // Make node deposit / create minipool
            await nodeDeposit({from: node, value: web3.utils.toWei('16', 'ether')});

            // Withdraw staked RPL
            await shouldRevert(withdrawRpl(rplAmount, {
                from: node,
            }), 'Withdrew RPL leaving the node undercollateralised');

        });


        it(printTitle('node operator', 'can withdraw RPL after finalising their minipool'), async () => {

            // Set parameters
            const rplAmount = web3.utils.toWei('10000', 'ether');

            // Remove withdrawal cooldown period
            await setRewardsClaimIntervalTime(0, {from: owner});

            // Stake RPL
            await nodeStakeRPL(rplAmount, {from: node});

            // Create a staking minipool
            await userDeposit({from: random, value: web3.utils.toWei('16', 'ether')});
            const minipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool, {from: node});

            // Cannot withdraw RPL yet
            await shouldRevert(withdrawRpl(rplAmount, {
                from: node,
            }), 'Withdrew RPL leaving the node undercollateralised');

            // Still cannot withdraw RPL yet
            await shouldRevert(withdrawRpl(rplAmount, {
                from: node,
            }), 'Withdrew RPL leaving the node undercollateralised');

            // Withdraw and finalise
            await withdrawValidatorBalance(minipool, web3.utils.toWei('32', 'ether'), node, true);

            // Should be able to withdraw now
            await withdrawRpl(rplAmount, {
                from: node,
            })

        });


        it(printTitle('node operator', 'cannot withdraw RPL if random distributes balance on their minipool until they finalise'), async () => {

            // Set parameters
            const rplAmount = web3.utils.toWei('10000', 'ether');

            // Remove withdrawal cooldown period
            await setRewardsClaimIntervalTime(0, {from: owner});

            // Stake RPL
            await nodeStakeRPL(rplAmount, {from: node});

            // Create a staking minipool
            await userDeposit({from: random, value: web3.utils.toWei('16', 'ether')});
            const minipool = await createMinipool({from: node, value: web3.utils.toWei('16', 'ether')});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool, {from: node});

            // Send ETH to the minipool to simulate receving from SWC
            await web3.eth.sendTransaction({
                from: trustedNode,
                to: minipool.address,
                value: web3.utils.toWei('32', 'ether')
            });

            // Begin user distribution process
            await beginUserDistribute(minipool, {from: random});
            // Wait 14 days
            await increaseTime(web3, 60 * 60 * 24 * 14 + 1)
            // Withdraw without finalising
            await withdrawValidatorBalance(minipool, '0', random);

            // Cannot withdraw RPL yet
            await shouldRevert(withdrawRpl(rplAmount, {
                from: node,
            }), 'Withdrew RPL leaving the node undercollateralised');

            // Finalise the pool
            await minipool.finalise({from: node});

            // Should be able to withdraw now
            await withdrawRpl(rplAmount, {
                from: node,
            })

        });


        it(printTitle('random address', 'cannot withdraw staked RPL'), async () => {

            // Set parameters
            const rplAmount = web3.utils.toWei('10000', 'ether');

            // Remove withdrawal cooldown period
            await setRewardsClaimIntervalTime(0, {from: owner});

            // Stake RPL
            await nodeStakeRPL(rplAmount, {from: node});

            // Withdraw staked RPL
            await shouldRevert(withdrawRpl(rplAmount, {
                from: random,
            }), 'Random address withdrew staked RPL');

        });


    });
}
