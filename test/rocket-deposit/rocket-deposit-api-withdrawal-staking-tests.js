import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketDepositIndex, RocketDepositSettings, RocketMinipoolInterface } from '../_lib/artifacts';
import { setRocketPoolWithdrawalKey } from '../_helpers/rocket-deposit';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { stakeSingleMinipool } from '../_helpers/rocket-minipool';
import { scenarioDeposit, scenarioWithdrawStakingMinipoolDeposit, scenarioAPIWithdrawStakingMinipoolDeposit } from './rocket-deposit-api-scenarios';

export default function() {

    contract('RocketDepositAPI - Staking Withdrawals', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const nodeOperator = accounts[2];
        const user1 = accounts[3];
        const user2 = accounts[4];
        const user3 = accounts[5];
        const withdrawalKeyOperator = accounts[6];


        // Setup
        let rocketDepositIndex;
        let rocketDepositSettings;
        let groupContract;
        let groupAccessorContract;
        let nodeContract;
        let minipoolAddresses;
        let minipool;
        let depositID;
        let depositAmount;
        before(async () => {

            // Set Rocket Pool withdrawal key
            await setRocketPoolWithdrawalKey({nodeOperator: withdrawalKeyOperator, owner});

            // Get contracts
            rocketDepositIndex = await RocketDepositIndex.deployed();
            rocketDepositSettings = await RocketDepositSettings.deployed();

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

            // Create node contract
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator});

            // Enable staking withdrawals
            await rocketDepositSettings.setStakingWithdrawalAllowed(true, {from: owner, gas: 500000});

        });


        // Staker cannot withdraw from a minipool that isn't staking
        it(printTitle('staker', 'cannot withdraw from a minipool that isn\'t staking'), async () => {

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

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 1, 'Pre-check failed: minipool is not at PreLaunch status');

            // Get deposit details
            depositID = await rocketDepositIndex.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);
            depositAmount = await minipool.getDepositBalance.call(depositID);

            // Attempt to withdraw minipool deposit
            await assertThrows(scenarioWithdrawStakingMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                amount: depositAmount,
                fromAddress: user1,
                gas: 5000000,
            }), 'Withdrew from a minipool that has not timed out');

        });


        // Staker can withdraw from a staking minipool
        it(printTitle('staker', 'can withdraw from a staking minipool'), async () => {

            // Progress minipool to staking
            await stakeSingleMinipool({
                minipoolAddress: minipool.address,
                nodeContract,
                nodeOperator,
                groupAccessorContract,
                staker: user3,
            });

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 2, 'Pre-check failed: minipool is not at Staking status');

            // Withdraw partial minipool deposit
            await scenarioWithdrawStakingMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                amount: web3.utils.numberToHex(parseInt(depositAmount) / 2),
                amountInt: parseInt(depositAmount) / 2,
                fromAddress: user1,
                gas: 5000000,
            });

            // Get deposit amount
            depositAmount = await minipool.getDepositBalance.call(depositID);

            // Withdraw remaining minipool deposit
            await scenarioWithdrawStakingMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                amount: depositAmount,
                fromAddress: user1,
                gas: 5000000,
            });

        });


        // Staker cannot withdraw a deposit with an invalid amount
        it(printTitle('staker', 'cannot withdraw a deposit with an invalid amount'), async () => {

            // Get deposit details
            depositID = await rocketDepositIndex.getUserQueuedDepositAt.call(groupContract.address, user2, '3m', 0);
            depositAmount = await minipool.getDepositBalance.call(depositID);

            // Attempt to withdraw minipool deposit
            await assertThrows(scenarioWithdrawStakingMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                amount: 0,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid deposit amount');

        });


        // Staker cannot withdraw a deposit with an invalid ID
        it(printTitle('staker', 'cannot withdraw a deposit with an invalid ID'), async () => {

            // Attempt to withdraw minipool deposit
            await assertThrows(scenarioWithdrawStakingMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000000',
                minipoolAddress: minipool.address,
                amount: depositAmount,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid deposit ID');

        });


        // Staker cannot withdraw a deposit while staking withdrawals are disabled
        it(printTitle('staker', 'cannot withdraw a deposit while staking withdrawals are disabled'), async () => {

            // Disable staking withdrawals
            await rocketDepositSettings.setStakingWithdrawalAllowed(false, {from: owner, gas: 500000});

            // Attempt to withdraw minipool deposit
            await assertThrows(scenarioWithdrawStakingMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                amount: depositAmount,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool while withdrawals were disabled');

            // Re-enable staking withdrawals
            await rocketDepositSettings.setStakingWithdrawalAllowed(true, {from: owner, gas: 500000});

        });


        // Staker cannot withdraw a nonexistant deposit
        it(printTitle('staker', 'cannot withdraw a nonexistant deposit'), async () => {

            // Nonexistant deposit ID
            await assertThrows(scenarioWithdrawStakingMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000001',
                minipoolAddress: minipool.address,
                amount: depositAmount,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid deposit ID');

            // Incorrect minipool
            await assertThrows(scenarioWithdrawStakingMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipoolAddresses[1],
                amount: depositAmount,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid minipool address');

            // Incorrect user
            await assertThrows(scenarioWithdrawStakingMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID,
                minipoolAddress: minipool.address,
                amount: depositAmount,
                fromAddress: user3,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid user ID');

        });


        // Staker cannot withdraw a deposit via deposit API
        it(printTitle('staker', 'cannot withdraw a deposit via deposit API'), async () => {

            // Invalid user ID
            await assertThrows(scenarioAPIWithdrawStakingMinipoolDeposit({
                groupID: groupContract.address,
                userID: '0x0000000000000000000000000000000000000000',
                depositID,
                minipoolAddress: minipool.address,
                amount: depositAmount,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid user ID');

            // Invalid group ID
            await assertThrows(scenarioAPIWithdrawStakingMinipoolDeposit({
                groupID: accounts[9],
                userID: user2,
                depositID,
                minipoolAddress: minipool.address,
                amount: depositAmount,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool with an invalid group ID');

            // Valid parameters; invalid withdrawer
            await assertThrows(scenarioAPIWithdrawStakingMinipoolDeposit({
                groupID: groupContract.address,
                userID: user2,
                depositID,
                minipoolAddress: minipool.address,
                amount: depositAmount,
                fromAddress: user2,
                gas: 5000000,
            }), 'Withdrew from a minipool directly via RocketDepositAPI');

        });


    });

}
