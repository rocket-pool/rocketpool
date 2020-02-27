import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketAdmin, RocketDepositSettings, RocketMinipoolInterface, RocketMinipoolSettings, RocketNodeSettings } from '../_lib/artifacts';
import { getDepositIDs, setRocketPoolWithdrawalKey, userDeposit, userWithdrawMinipoolDeposit } from '../_helpers/rocket-deposit';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { timeoutMinipool, stakeSingleMinipool, logoutMinipool, withdrawMinipool } from '../_helpers/rocket-minipool';
import { mintRpl } from '../_helpers/rocket-pool-token';
import { scenarioWithdrawMinipoolDeposit } from './rocket-node-contract-scenarios';

export default function() {

    contract('RocketNodeContract - Withdrawals', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const operator = accounts[1];
        const operator2 = accounts[2];
        const groupOwner = accounts[3];
        const staker = accounts[4];
        const staker2 = accounts[5];
        const staker3 = accounts[6];
        const withdrawalKeyOperator = accounts[7];


        // Setup
        let rocketDepositSettings;
        let rocketMinipoolSettings;
        let rocketNodeSettings;
        let nodeContract;
        let nodeContract2;
        let groupContract;
        let groupAccessorContract;
        let minipool;
        let minipool2;
        before(async () => {

            // Set Rocket Pool withdrawal key
            await setRocketPoolWithdrawalKey({nodeOperator: withdrawalKeyOperator, owner});

            // Get contracts
            rocketDepositSettings = await RocketDepositSettings.deployed();
            rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
            rocketNodeSettings = await RocketNodeSettings.deployed();

            // Create node contracts
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: operator});
            nodeContract2 = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: operator2});

            // Make node operator trusted
            let rocketAdmin = await RocketAdmin.deployed();
            await rocketAdmin.setNodeTrusted(operator2, true, {from: owner, gas: 5000000});

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

        });


        // Node operator cannot withdraw from a minipool while node withdrawals are disabled
        it(printTitle('node operator', 'cannot withdraw from a minipool while node withdrawals are disabled'), async () => {

            // Operator 1: create single minipool
            let minipoolAddress = (await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator, owner}))[0];
            minipool = await RocketMinipoolInterface.at(minipoolAddress);

            // Operator 2: create single minipool
            let minipoolAddress2 = (await createNodeMinipools({nodeContract: nodeContract2, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator2, owner}))[0];
            minipool2 = await RocketMinipoolInterface.at(minipoolAddress2);

            // Check minipool statuses
            let status = parseInt(await minipool.getStatus.call());
            let status2 = parseInt(await minipool2.getStatus.call());
            assert.equal(status, 0, 'Pre-check failed: minipool 1 is not at Initialised status');
            assert.equal(status2, 0, 'Pre-check failed: minipool 2 is not at Initialised status');

            // Disable node withdrawals
            await rocketNodeSettings.setWithdrawalAllowed(false, {from: owner, gas: 500000});

            // Attempt to withdraw node deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 5000000,
            }), 'Withdrew from a minipool while node withdrawals were disabled');

            // Re-enable node withdrawals
            await rocketNodeSettings.setWithdrawalAllowed(true, {from: owner, gas: 500000});

        });


        // Random account cannot withdraw a node deposit from a minipool
        it(printTitle('random account', 'cannot withdraw a node deposit from a minipool'), async () => {

            // Attempt to withdraw node deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: staker,
                gas: 5000000,
            }), 'Random account withdrew a node deposit from a minipool');

        });


        // Node operator can withdraw from an initialised minipool
        it(printTitle('node operator', 'can withdraw from an initialised minipool'), async () => {

            // Operator 1: withdraw node deposit (destroys minipool)
            await scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 5000000,
            });

            // Operator 2: withdraw node deposit (destroys minipool)
            await scenarioWithdrawMinipoolDeposit({
                nodeContract: nodeContract2,
                minipoolAddress: minipool2.address,
                fromAddress: operator2,
                gas: 5000000,
            });

        });


        // Node operator can withdraw from an initialised minipool with an RPL balance
        it(printTitle('node operator', 'can withdraw from an initialised minipool with an RPL balance'), async () => {

            // Create single minipool
            let minipoolAddress = (await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator, owner}))[0];
            minipool = await RocketMinipoolInterface.at(minipoolAddress);

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 0, 'Pre-check failed: minipool is not at Initialised status');

            // Send RPL to minipool contract
            await mintRpl({toAddress: minipoolAddress, rplAmount: web3.utils.toWei('1', 'ether'), fromAddress: owner});

            // Withdraw node deposit - with minipool RPL balance (destroys minipool)
            await scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 5000000,
            });

        });


        // Node operator can withdraw from an initialised minipool while minipool closure is disabled
        it(printTitle('node operator', 'can withdraw from an initialised minipool while minipool closure is disabled'), async () => {

            // Create single minipool
            let minipoolAddress = (await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator, owner}))[0];
            minipool = await RocketMinipoolInterface.at(minipoolAddress);

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 0, 'Pre-check failed: minipool is not at Initialised status');

            // Disable minipool closure
            await rocketMinipoolSettings.setMinipoolClosingEnabled(false, {from: owner, gas: 500000});

            // Withdraw node deposit - with minipool closure disabled (does not destroy minipool)
            await scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 5000000,
            });

            // Re-enable minipool closure
            await rocketMinipoolSettings.setMinipoolClosingEnabled(true, {from: owner, gas: 500000});

            // Destroy minipool
            await minipool.updateStatus({from: owner});

        });


        // Node operator cannot withdraw from a pre-launch minipool
        it(printTitle('node operator', 'cannot withdraw from a pre-launch minipool'), async () => {

            // Create single minipool
            let minipoolAddress = (await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator, owner}))[0];
            minipool = await RocketMinipoolInterface.at(minipoolAddress);

            // Get deposit settings
            let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());

            // Deposit
            await userDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: staker,
                value: chunkSize,
            });

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 1, 'Pre-check failed: minipool is not at DepositAssigned status');

            // Attempt to withdraw node deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 5000000,
            }), 'Withdrew from a pre-launch minipool');

        });


        // Node operator can withdraw from a timed out minipool
        it(printTitle('node operator', 'can withdraw from a timed out minipool'), async () => {

            // Time out minipool
            await timeoutMinipool({minipoolAddress: minipool.address, owner});

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 7, 'Pre-check failed: minipool is not at TimedOut status');

            // Withdraw node deposit
            await scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 5000000,
            });

        });


        // Node operator cannot withdraw from a staking minipool
        it(printTitle('node operator', 'cannot withdraw from a staking minipool'), async () => {

            // Operator 1: create single minipool
            let minipoolAddress = (await createNodeMinipools({nodeContract: nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator, owner}))[0];
            minipool = await RocketMinipoolInterface.at(minipoolAddress);

            // Progress minipool to staking
            await stakeSingleMinipool({
                minipoolAddress: minipoolAddress,
                nodeContract: nodeContract,
                nodeOperator: operator,
                groupAccessorContract,
                staker: staker2,
            });

            // Operator 2: create single minipool
            let minipoolAddress2 = (await createNodeMinipools({nodeContract: nodeContract2, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator2, owner}))[0];
            minipool2 = await RocketMinipoolInterface.at(minipoolAddress2);

            // Progress minipool to staking
            await stakeSingleMinipool({
                minipoolAddress: minipoolAddress2,
                nodeContract: nodeContract2,
                nodeOperator: operator2,
                groupAccessorContract,
                staker: staker3,
                depositLoops: 2,
            });

            // Check minipool statuses
            let status = parseInt(await minipool.getStatus.call());
            let status2 = parseInt(await minipool2.getStatus.call());
            assert.equal(status, 3, 'Pre-check failed: minipool 1 is not at Staking status');
            assert.equal(status2, 3, 'Pre-check failed: minipool 2 is not at Staking status');

            // Withdraw node deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 5000000,
            }), 'Withdrew from a staking minipool');

        });


        // Node operator cannot withdraw from a logged out minipool
        it(printTitle('node operator', 'cannot withdraw from a logged out minipool'), async () => {

            // Log out minipools
            await logoutMinipool({minipoolAddress: minipool.address, nodeOperator: operator2, owner});
            await logoutMinipool({minipoolAddress: minipool2.address, nodeOperator: operator2, owner});

            // Check minipool statuses
            let status = parseInt(await minipool.getStatus.call());
            let status2 = parseInt(await minipool2.getStatus.call());
            assert.equal(status, 4, 'Pre-check failed: minipool 1 is not at LoggedOut status');
            assert.equal(status2, 4, 'Pre-check failed: minipool 2 is not at LoggedOut status');

            // Withdraw node deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 5000000,
            }), 'Withdrew from a logged out minipool');

        });


        // Node operator can withdraw from a withdrawn minipool
        it(printTitle('node operator', 'can withdraw from a withdrawn minipool'), async () => {

            // Withdraw minipools
            await withdrawMinipool({minipoolAddress: minipool.address, balance: web3.utils.toWei('36', 'ether'), nodeOperator: operator2, owner});
            await withdrawMinipool({minipoolAddress: minipool2.address, balance: web3.utils.toWei('14', 'ether'), nodeOperator: operator2, owner});

            // Check minipool statuses
            let status = parseInt(await minipool.getStatus.call());
            let status2 = parseInt(await minipool2.getStatus.call());
            assert.equal(status, 5, 'Pre-check failed: minipool 1 is not at Withdrawn status');
            assert.equal(status2, 5, 'Pre-check failed: minipool 2 is not at Withdrawn status');

            // Withdraw all user deposits from minipool to force minipool to close
            let depositIDs = await getDepositIDs({groupID: groupContract.address, userID: staker2, durationID: '3m'});
            for (var di = 0; di < depositIDs.length; ++di) await userWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID: depositIDs[di],
                minipoolAddress: minipool.address,
                userAddress: staker2
            });

            // Check minipool deposits
            let depositCount = parseInt(await minipool.getDepositCount.call());
            assert.equal(depositCount, 0, 'Pre-check failed: minipool has user deposits');

            // Operator 1: withdraw node deposit
            await scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 5000000,
            });

            // Operator 2: withdraw node deposit
            await scenarioWithdrawMinipoolDeposit({
                nodeContract: nodeContract2,
                minipoolAddress: minipool2.address,
                fromAddress: operator2,
                gas: 5000000,
            });

            // Check if minipool is destroyed
            let minipoolCode = await web3.eth.getCode(minipool.address);
            let minipoolExists = (minipoolCode != '0x0' && minipoolCode != '0x');
            assert.isFalse(minipoolExists, 'Post-check failed: Minipool was not destroyed');

        });


        // Node operator cannot withdraw from another node's minipool
        it(printTitle('node operator', 'cannot withdraw from another node\'s minipool'), async () => {

            // Create single minipool
            let minipoolAddress2 = (await createNodeMinipools({nodeContract: nodeContract2, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator2, owner}))[0];
            minipool2 = await RocketMinipoolInterface.at(minipoolAddress2);

            // Check minipool status
            let status = parseInt(await minipool2.getStatus.call());
            assert.equal(status, 0, 'Pre-check failed: minipool is not at Initialised status');

            // Attempt to withdraw node deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool2.address,
                fromAddress: operator,
                gas: 5000000,
            }), 'Withdrew from another node\'s minipool');

        });


        // Node operator cannot withdraw from an invalid minipool
        it(printTitle('node operator', 'cannot withdraw from an invalid minipool'), async () => {

            // Attempt to withdraw node deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: accounts[9],
                fromAddress: operator,
                gas: 5000000,
            }), 'Withdrew from an invalid minipool');

        });


    });

}
