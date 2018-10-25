import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketDepositSettings, RocketMinipoolInterface, RocketNodeSettings } from '../_lib/artifacts';
import { userDeposit } from '../_helpers/rocket-deposit';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { timeoutMinipool } from '../_helpers/rocket-minipool';
import { mintRpl } from '../_helpers/rocket-pool-token';
import { scenarioWithdrawMinipoolDeposit } from './rocket-node-contract-scenarios';

export default function() {

    contract('RocketNodeContract - Withdrawals', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const operator = accounts[1];
        const groupOwner = accounts[2];
        const staker = accounts[3];


        // Setup
        let rocketDepositSettings;
        let rocketNodeSettings;
        let nodeContract;
        let groupContract;
        let groupAccessorContract;
        let minipool;
        before(async () => {

            // Get contracts
            rocketDepositSettings = await RocketDepositSettings.deployed();
            rocketNodeSettings = await RocketNodeSettings.deployed();

            // Create node contract
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: operator});

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

        });


        // Node operator can withdraw from an initialised minipool
        it(printTitle('node operator', 'can withdraw from an initialised minipool'), async () => {

            // Create single minipool
            let minipoolAddress = (await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator, owner}))[0];
            minipool = await RocketMinipoolInterface.at(minipoolAddress);

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 0, 'Pre-check failed: minipool is not at Initialised status');

            // Withdraw node deposit (destroys minipool)
            await scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 500000,
            });

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
            assert.equal(status, 1, 'Pre-check failed: minipool is not at PreLaunch status');

            // Attempt to withdraw node deposit
            await assertThrows(scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 500000,
            }), 'Withdrew from a pre-launch minipool');

        });


        // Node operator can withdraw from a timed out minipool
        it(printTitle('node operator', 'can withdraw from a timed out minipool'), async () => {

            // Time out minipool
            await timeoutMinipool({minipoolAddress: minipool.address, owner});

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 6, 'Pre-check failed: minipool is not at TimedOut status');

            // Withdraw node deposit
            await scenarioWithdrawMinipoolDeposit({
                nodeContract,
                minipoolAddress: minipool.address,
                fromAddress: operator,
                gas: 500000,
            });

        });


    });

}
