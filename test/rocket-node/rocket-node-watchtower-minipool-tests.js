import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketAdmin, RocketMinipoolInterface } from '../_lib/artifacts';
import { setRocketPoolWithdrawalKey } from '../_helpers/rocket-deposit';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { stakeSingleMinipool } from '../_helpers/rocket-minipool';
import { scenarioLogoutMinipool, scenarioWithdrawMinipool } from './rocket-node-watchtower-scenarios';

export default function() {

    contract('RocketNodeWatchtower - Minipools', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const untrustedNodeOperator = accounts[2];
        const trustedNodeOperator = accounts[3];
        const staker = accounts[4];
        const withdrawalKeyOperator = accounts[5];


        // Setup
        let untrustedNodeContract;
        let trustedNodeContract;
        let minipool;
        let groupAccessorContract;
        before(async () => {

            // Set Rocket Pool withdrawal key
            await setRocketPoolWithdrawalKey({nodeOperator: withdrawalKeyOperator, owner});

            // Create node contracts
            untrustedNodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: untrustedNodeOperator});
            trustedNodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: trustedNodeOperator});

            // Set node contract status
            let rocketAdmin = await RocketAdmin.deployed();
            await rocketAdmin.setNodeTrusted(trustedNodeOperator, true, {from: owner, gas: 500000});

            // Create minipool
            let minipoolAddresses = await createNodeMinipools({nodeContract: untrustedNodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: untrustedNodeOperator, owner});
            minipool = await RocketMinipoolInterface.at(minipoolAddresses[0]);

            // Create group contract
            let groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

        });


        // Trusted node cannot logout a minipool that is not staking
        it(printTitle('trusted node', 'cannot logout a minipool that is not staking'), async () => {

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.notEqual(status, 2, 'Pre-check failed: minipool is at Staking status');

            // Attempt logout
            await assertThrows(scenarioLogoutMinipool({
                minipool,
                fromAddress: trustedNodeOperator,
                gas: 500000,
            }), 'Logged out a minipool that was not staking');

        });


        // Trusted node cannot withdraw a minipool that is not logged out
        it(printTitle('trusted node', 'cannot withdraw a minipool that is not logged out'), async () => {

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.notEqual(status, 3, 'Pre-check failed: minipool is at LoggedOut status');

            // Attempt withdrawal
            await assertThrows(scenarioWithdrawMinipool({
                minipool,
                balance: web3.utils.toWei('32', 'ether'),
                fromAddress: trustedNodeOperator,
                gas: 500000,
            }), 'Withdrew a minipool that was not logged out');

        });


        // Untrusted node cannot logout a staking minipool
        it(printTitle('untrusted node', 'cannot logout a staking minipool'), async () => {

            // Progress minipool to staking
            await stakeSingleMinipool({
                minipoolAddress: minipool.address,
                nodeContract: untrustedNodeContract,
                nodeOperator: untrustedNodeOperator,
                groupAccessorContract,
                staker,
            });

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 2, 'Pre-check failed: minipool is not at Staking status');

            // Attempt logout
            await assertThrows(scenarioLogoutMinipool({
                minipool,
                fromAddress: untrustedNodeOperator,
                gas: 500000,
            }), 'Untrusted node logged out a staking minipool');

        });


        // Trusted node can logout a staking minipool
        it(printTitle('trusted node', 'can logout a staking minipool'), async () => {

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 2, 'Pre-check failed: minipool is not at Staking status');

            // Logout
            await scenarioLogoutMinipool({
                minipool,
                fromAddress: trustedNodeOperator,
                gas: 500000,
            });

        });


        // Untrusted node cannot withdraw a logged out minipool
        it(printTitle('untrusted node', 'cannot withdraw a logged out minipool'), async () => {

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 3, 'Pre-check failed: minipool is not at LoggedOut status');

            // Attempt withdrawal
            await assertThrows(scenarioWithdrawMinipool({
                minipool,
                balance: web3.utils.toWei('32', 'ether'),
                fromAddress: untrustedNodeOperator,
                gas: 500000,
            }), 'Untrusted node withdrew a logged out minipool');

        });


        // Trusted node can withdraw a logged out minipool
        it(printTitle('trusted node', 'can withdraw a logged out minipool'), async () => {

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 3, 'Pre-check failed: minipool is not at LoggedOut status');

            // Withdraw
            await scenarioWithdrawMinipool({
                minipool,
                balance: web3.utils.toWei('32', 'ether'),
                fromAddress: trustedNodeOperator,
                gas: 500000,
            });

        });


    });

}
