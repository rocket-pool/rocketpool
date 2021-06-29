import { RocketNodeStaking } from '../_utils/artifacts';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, nodeStakeRPL, nodeDeposit } from '../_helpers/node';
import { mintRPL, approveRPL } from '../_helpers/tokens';
import { stakeRpl } from './scenario-stake-rpl';
import { withdrawRpl } from './scenario-withdraw-rpl';
import { setRewardsClaimIntervalTime } from '../dao/scenario-dao-protocol-bootstrap'

export default function() {
    contract('RocketNodeStaking', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            random,
        ] = accounts;


        // Setup
        let rocketNodeStaking;
        before(async () => {

            // Load contracts
            rocketNodeStaking = await RocketNodeStaking.deployed();

            // Register node
            await registerNode({from: node});

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


        it(printTitle('node operator', 'cannot withdraw RPL leaving the node undercollateralized'), async () => {

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
            }), 'Withdrew RPL leaving the node undercollateralized');

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
