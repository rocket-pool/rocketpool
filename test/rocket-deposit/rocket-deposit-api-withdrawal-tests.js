import { printTitle, assertThrows } from '../_lib/utils/general';
import { DummyBeaconChain } from '../_lib/utils/beacon';
import { RocketDepositAPI, RocketDepositSettings, RocketMinipoolInterface } from '../_lib/artifacts';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { timeoutMinipool } from '../_helpers/rocket-minipool';
import { scenarioDeposit, scenarioWithdrawMinipoolDeposit, scenarioAPIWithdrawMinipoolDeposit } from './rocket-deposit-api-scenarios';

export default function() {

    contract('RocketDepositAPI - Withdrawals', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const nodeOperator = accounts[2];
        const user1 = accounts[3];
        const user2 = accounts[4];
        const user3 = accounts[5];


        // Setup
        let beaconChain;
        let rocketDepositAPI;
        let rocketDepositSettings;
        let groupContract;
        let groupAccessorContract;
        let nodeContract;
        let minipoolAddresses;
        let minipool;
        let depositID;
        before(async () => {

            // Initialise dummy beacon chain
            beaconChain = new DummyBeaconChain(web3);
            await beaconChain.init();

            // Get contracts
            rocketDepositAPI = await RocketDepositAPI.deployed();
            rocketDepositSettings = await RocketDepositSettings.deployed();

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

            // Create node contract
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator});

        });


        // Staker cannot withdraw from a minipool that has not timed out or withdrawn
        it(printTitle('staker', 'cannot withdraw from a minipool that has not timed out or withdrawn'), async () => {

            // Create single minipool
            minipoolAddresses = await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 2, nodeOperator, owner});
            minipool = await RocketMinipoolInterface.at(minipoolAddresses[0]);

            // Get deposit settings
            let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());

            // Deposit to minipool
            await scenarioDeposit({
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: chunkSize,
            });
            await scenarioDeposit({
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: chunkSize,
            });

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 1, 'Pre-check failed: minipool is not at PreLaunch status');

            // Get deposit ID
            depositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);

            // Attempt to withdraw minipool deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user1,
                gas: 5000000,
            }), 'Withdrew from a minipool that has not timed out or withdrawn');

        });


        // Staker can withdraw from a timed out minipool
        it(printTitle('staker', 'can withdraw from a timed out minipool'), async () => {

            // Time out minipool
            await timeoutMinipool({minipoolAddress: minipool.address, owner});

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 6, 'Pre-check failed: minipool is not at TimedOut status');

            // Withdraw minipool deposit
            await scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user1,
                gas: 5000000,
            });

        });


        // Staker cannot withdraw a deposit with an invalid ID
        it(printTitle('staker', 'cannot withdraw a deposit with an invalid ID'), async () => {

            // Get deposit ID
            depositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContract.address, user2, '3m', 0);

            // Attempt to withdraw minipool deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000000',
                minipoolAddress: minipool.address,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid deposit ID');

        });


        // Staker cannot withdraw a deposit while withdrawals are disabled
        it(printTitle('staker', 'cannot withdraw a deposit while withdrawals are disabled'), async () => {

            // Disable refunds
            await rocketDepositSettings.setWithdrawalAllowed(false, {from: owner, gas: 500000});

            // Attempt to withdraw minipool deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool while withdrawals were disabled');

            // Re-enable refunds
            await rocketDepositSettings.setWithdrawalAllowed(true, {from: owner, gas: 500000});

        });


        // Staker cannot withdraw a nonexistant deposit
        it(printTitle('staker', 'cannot withdraw a nonexistant deposit'), async () => {

            // Nonexistant deposit ID
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000001',
                minipoolAddress: minipool.address,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid deposit ID');

            // Incorrect minipool
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipoolAddresses[1],
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid minipool address');

            // Incorrect user
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user3,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid user ID');

        });


        // Staker cannot withdraw a deposit via deposit API
        it(printTitle('staker', 'cannot withdraw a deposit via deposit API'), async () => {

            // Invalid user ID
            await assertThrows(scenarioAPIWithdrawMinipoolDeposit({
                groupID: groupContract.address,
                userID: '0x0000000000000000000000000000000000000000',
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid user ID');

            // Invalid group ID
            await assertThrows(scenarioAPIWithdrawMinipoolDeposit({
                groupID: accounts[9],
                userID: user2,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid group ID');

            // Valid parameters; invalid withdrawer
            await assertThrows(scenarioAPIWithdrawMinipoolDeposit({
                groupID: groupContract.address,
                userID: user2,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool directly via RocketDepositAPI');

        });


    });

}
