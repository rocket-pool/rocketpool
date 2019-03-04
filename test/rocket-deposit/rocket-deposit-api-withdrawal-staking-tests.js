import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketDepositAPI, RocketDepositSettings, RocketMinipoolInterface } from '../_lib/artifacts';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { scenarioDeposit, scenarioWithdrawStakingMinipoolDeposit } from './rocket-deposit-api-scenarios';

export default function() {

    contract('RocketDepositAPI - Staking Withdrawals', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const nodeOperator = accounts[2];
        const user1 = accounts[3];
        const user2 = accounts[4];


        // Setup
        let rocketDepositAPI;
        let rocketDepositSettings;
        let groupContract;
        let groupAccessorContract;
        let nodeContract;
        let minipoolAddresses;
        let minipool;
        let depositID;
        let depositAmount;
        before(async () => {

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
            depositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);
            depositAmount = await minipool.getUserDeposit.call(user1);

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


    });

}
