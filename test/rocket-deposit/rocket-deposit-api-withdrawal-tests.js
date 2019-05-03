import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketDepositIndex, RocketDepositSettings, RocketMinipoolInterface, RocketMinipoolSettings } from '../_lib/artifacts';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { stakeSingleMinipool, withdrawMinipool, enableMinipoolBackupCollect } from '../_helpers/rocket-minipool';
import { scenarioDeposit, scenarioWithdrawMinipoolDeposit, scenarioAPIWithdrawMinipoolDeposit, scenarioSetBackupWithdrawalAddress, scenarioAPISetBackupWithdrawalAddress } from './rocket-deposit-api-scenarios';

export default function() {

    contract('RocketDepositAPI - Withdrawals', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const nodeOperator = accounts[2];
        const user1 = accounts[3];
        const user2 = accounts[4];
        const user3 = accounts[5];
        const user4 = accounts[6];
        const user2Backup = accounts[7];
        const user4Backup = accounts[8];


        // Setup
        let rocketDepositIndex;
        let rocketDepositSettings;
        let rocketMinipoolSettings;
        let groupContract;
        let groupAccessorContract;
        let nodeContract;
        let minipoolAddresses;
        let minipool;
        let depositID;
        before(async () => {

            // Get contracts
            rocketDepositIndex = await RocketDepositIndex.deployed();
            rocketDepositSettings = await RocketDepositSettings.deployed();
            rocketMinipoolSettings = await RocketMinipoolSettings.deployed();

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

            // Create node contract
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator});

        });


        // Staker cannot withdraw from a minipool that hasn't withdrawn
        it(printTitle('staker', 'cannot withdraw from a minipool that hasn\'t withdrawn'), async () => {

            // Create single minipool
            minipoolAddresses = await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 2, nodeOperator, owner});
            minipool = await RocketMinipoolInterface.at(minipoolAddresses[0]);

            // Get deposit settings
            let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());

            // Deposit to minipool
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: chunkSize,
            });
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: chunkSize,
            });

            // Progress minipool to staking
            await stakeSingleMinipool({groupAccessorContract, staker: user3});

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 2, 'Pre-check failed: minipool is not at Staking status');

            // Get deposit ID
            depositID = await rocketDepositIndex.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);

            // Attempt to withdraw minipool deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user1,
                gas: 5000000,
            }), 'Withdrew from a minipool that has not withdrawn');

        });


        // Staker cannot set an invalid backup withdrawal address
        it(printTitle('staker', 'cannot set an invalid backup withdrawal address'), async () => {
            await assertThrows(scenarioSetBackupWithdrawalAddress({
                withdrawerContract: groupAccessorContract,
                minipoolAddress: minipool.address,
                backupWithdrawalAddress: '0x0000000000000000000000000000000000000000',
                fromAddress: user2,
                gas: 5000000,
            }), 'Set an invalid backup withdrawal address');
        });


        // Staker cannot set their backup withdrawal address to their current address
        it(printTitle('staker', 'cannot set their backup withdrawal address to their current address'), async () => {
            await assertThrows(scenarioSetBackupWithdrawalAddress({
                withdrawerContract: groupAccessorContract,
                minipoolAddress: minipool.address,
                backupWithdrawalAddress: user2,
                fromAddress: user2,
                gas: 5000000,
            }), 'Set a backup withdrawal address to the user\'s current address');
        });


        // Staker cannot set a backup withdrawal address via the deposit API
        it(printTitle('staker', 'cannot set a backup withdrawal address via the deposit API'), async () => {

            // Invalid user ID
            await assertThrows(scenarioAPISetBackupWithdrawalAddress({
                groupID: groupContract.address,
                userID: '0x0000000000000000000000000000000000000000',
                minipoolAddress: minipool.address,
                backupWithdrawalAddress: user2Backup,
                fromAddress: user2,
                gas: 5000000,
            }), 'Set a backup withdrawal address with an invalid user ID');

            // Invalid group ID
            await assertThrows(scenarioAPISetBackupWithdrawalAddress({
                groupID: accounts[9],
                userID: user2,
                minipoolAddress: minipool.address,
                backupWithdrawalAddress: user2Backup,
                fromAddress: user2,
                gas: 5000000,
            }), 'Set a backup withdrawal address with an invalid group ID');

            // Valid parameters; invalid withdrawer
            await assertThrows(scenarioAPISetBackupWithdrawalAddress({
                groupID: groupContract.address,
                userID: user2,
                minipoolAddress: minipool.address,
                backupWithdrawalAddress: user2Backup,
                fromAddress: user2,
                gas: 5000000,
            }), 'Set a backup withdrawal address directly via RocketDepositAPI');

        });


        // Staker can set a backup withdrawal address while a minipool is staking
        it(printTitle('staker', 'can set a backup withdrawal address while a minipool is staking'), async () => {
            await scenarioSetBackupWithdrawalAddress({
                withdrawerContract: groupAccessorContract,
                minipoolAddress: minipool.address,
                backupWithdrawalAddress: user2Backup,
                fromAddress: user2,
                gas: 5000000,
            });
        });


        // Staker cannot set a backup withdrawal address which is in use
        it(printTitle('staker', 'cannot set a backup withdrawal address which is in use'), async () => {

            // Existing user address
            await assertThrows(scenarioSetBackupWithdrawalAddress({
                withdrawerContract: groupAccessorContract,
                minipoolAddress: minipool.address,
                backupWithdrawalAddress: user2,
                fromAddress: user1,
                gas: 5000000,
            }), 'Set a backup withdrawal address in use as a user address');

            // Existing backup address
            await assertThrows(scenarioSetBackupWithdrawalAddress({
                withdrawerContract: groupAccessorContract,
                minipoolAddress: minipool.address,
                backupWithdrawalAddress: user2Backup,
                fromAddress: user1,
                gas: 5000000,
            }), 'Set a backup withdrawal address in use as another backup address');

        });


        // Random account cannot set a backup withdrawal address
        it(printTitle('random account', 'cannot set a backup withdrawal address'), async () => {
            await assertThrows(scenarioSetBackupWithdrawalAddress({
                withdrawerContract: groupAccessorContract,
                minipoolAddress: minipool.address,
                backupWithdrawalAddress: user4Backup,
                fromAddress: user4,
                gas: 5000000,
            }), 'Random account set a backup withdrawal address');
        });


        // Staker can withdraw from a withdrawn minipool
        it(printTitle('staker', 'can withdraw from a withdrawn minipool'), async () => {

            // Withdraw minipool
            await withdrawMinipool({minipoolAddress: minipool.address, balance: web3.utils.toWei('36', 'ether'), nodeOperator, owner});

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 4, 'Pre-check failed: minipool is not at Withdrawn status');

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
            depositID = await rocketDepositIndex.getUserQueuedDepositAt.call(groupContract.address, user2, '3m', 0);

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

            // Disable withdrawals
            await rocketDepositSettings.setWithdrawalAllowed(false, {from: owner, gas: 500000});

            // Attempt to withdraw minipool deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool while withdrawals were disabled');

            // Re-enable withdrawals
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


        // Staker cannot set a backup withdrawal address after a minipool has logged out
        it(printTitle('staker', 'cannot set a backup withdrawal address after a minipool has logged out'), async () => {
            await assertThrows(scenarioSetBackupWithdrawalAddress({
                withdrawerContract: groupAccessorContract,
                minipoolAddress: minipool.address,
                backupWithdrawalAddress: user4Backup,
                fromAddress: user2,
                gas: 5000000,
            }), 'Set a backup withdrawal address after minipool logout');
        });


        // Staker cannot withdraw using a backup withdrawal address before backup collect duration has passed
        it(printTitle('staker', 'cannot withdraw using a backup withdrawal address before backup collect duration has passed'), async () => {
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user2Backup,
                gas: 5000000,
            }), 'Withdrew from a backup address before backup collection duration passed');
        });


        // Staker cannot withdraw using a backup withdrawal address while backup collection is disabled
        it(printTitle('staker', 'cannot withdraw using a backup withdrawal address while backup collection is disabled'), async () => {

            // Enable minipool backup collection
            await rocketMinipoolSettings.setMinipoolBackupCollectDuration(5, {from: owner, gas: 500000});
            await enableMinipoolBackupCollect({minipoolAddress: minipool.address});

            // Disable backup collection
            await rocketMinipoolSettings.setMinipoolBackupCollectEnabled(false, {from: owner, gas: 500000});

            // Withdraw
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user2Backup,
                gas: 5000000,
            }), 'Withdrew from a backup address while backup collection was disabled');

            // Re-enable backup collection
            await rocketMinipoolSettings.setMinipoolBackupCollectEnabled(true, {from: owner, gas: 500000});

        });


        // Staker can withdraw using a backup withdrawal address
        it(printTitle('staker', 'can withdraw using a backup withdrawal address'), async () => {

            // Withdraw
            await scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                fromAddress: user2Backup,
                gas: 5000000,
            });

            // Reset backup collect duration
            await rocketMinipoolSettings.setMinipoolBackupCollectDuration(526000, {from: owner, gas: 500000});

        });


    });

}
