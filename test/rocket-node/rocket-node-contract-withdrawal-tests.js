import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketMinipoolInterface, RocketNodeSettings } from '../_lib/artifacts';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { mintRpl } from '../_helpers/rocket-pool-token';
import { scenarioWithdrawMinipoolDeposit } from './rocket-node-contract-scenarios';

export default function() {

    contract('RocketNodeContract - Withdrawals', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const operator = accounts[1];


        // Setup
        let rocketNodeSettings;
        let nodeContract;
        let minipool;
        before(async () => {

            // Get contracts
            rocketNodeSettings = await RocketNodeSettings.deployed();

            // Create node contract
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: operator});

        });


        // Node operator can withdraw from an initialised minipool
        it(printTitle('node operator', 'can withdraw from an initialised minipool'), async () => {

            // Create single minipool
            let minipoolAddress = (await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator, owner}))[0];
            minipool = await RocketMinipoolInterface.at(minipoolAddress);

            // Check minipool status
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 0, 'Pre-check failed: minipool is not at PreLaunch status');

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
