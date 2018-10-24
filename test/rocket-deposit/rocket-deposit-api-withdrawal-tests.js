import { printTitle, assertThrows } from '../_lib/utils/general';
import { DummyBeaconChain } from '../_lib/utils/beacon';
import { RocketDepositAPI, RocketDepositSettings, RocketMinipoolInterface } from '../_lib/artifacts';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { timeoutMinipool } from '../_helpers/rocket-minipool';
import { scenarioDeposit, scenarioWithdrawMinipoolDeposit } from './rocket-deposit-api-scenarios';

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


        // Staker can withdraw from a timed out minipool
        it(printTitle('staker', 'can withdraw from a timed out minipool'), async () => {

            // Get deposit settings
            let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());

            // Create single minipool
            let minipoolAddress = (await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator, owner}))[0];
            let minipool = await RocketMinipoolInterface.at(minipoolAddress);

            // Deposit to minipool
            await scenarioDeposit({
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: chunkSize,
                gas: 7500000,
            });
            await scenarioDeposit({
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user2,
                value: chunkSize,
                gas: 7500000,
            });
            await scenarioDeposit({
                beaconChain,
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user3,
                value: chunkSize,
                gas: 7500000,
            });

            // Check minipool status
            let status1 = parseInt(await minipool.getStatus.call());
            assert.equal(status1, 1, 'Pre-check failed: minipool is not at PreLaunch status');

            // Time out minipool
            await timeoutMinipool({minipoolAddress, owner});

            // Check minipool status
            let status2 = parseInt(await minipool.getStatus.call());
            assert.equal(status2, 6, 'Pre-check failed: minipool is not at TimedOut status');

            // Get deposit ID
            let user1DepositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);

            // Withdraw minipool deposit
            await scenarioWithdrawMinipoolDeposit({
                withdrawerContract: groupAccessorContract,
                depositID: user1DepositID,
                minipoolAddress: minipoolAddress,
                fromAddress: user1,
                gas: 500000,
            });

        });


    });

}
