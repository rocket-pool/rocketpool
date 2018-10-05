import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketDepositAPI, RocketDepositSettings, RocketGroupAPI, RocketGroupAccessorContract, RocketGroupContract, RocketGroupSettings, RocketMinipoolSettings, RocketNodeAPI, RocketNodeContract, RocketPoolToken } from '../_lib/artifacts';
import { scenarioDeposit, scenarioRefundDeposit, scenarioAPIDeposit, scenarioAPIRefundDeposit } from './rocket-deposit-api-scenarios';


// Get user's queued deposit IDs
async function getQueuedDepositIDs(groupID, userID, durationID) {
    const rocketDepositAPI = await RocketDepositAPI.deployed();
    let depositCount = parseInt(await rocketDepositAPI.getUserQueuedDepositCount.call(groupID, userID, durationID));
    let depositIDs = [], di;
    for (di = 0; di < depositCount; ++di) depositIDs.push(await rocketDepositAPI.getUserQueuedDepositAt.call(groupID, userID, durationID, di));
    return depositIDs;
}


export default function() {

    contract('RocketDepositAPI', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const nodeOperator = accounts[2];
        const user1 = accounts[3];
        const user2 = accounts[4];


        // Setup
        let rocketDepositAPI;
        let rocketDepositSettings;
        let minDepositSize;
        let numMinDeposits;
        let initialDepositSize;
        let groupContractAddress;
        let groupAccessorContract;
        before(async () => {


            //
            // Deposit
            //

            // Get deposit contracts
            rocketDepositAPI =  await RocketDepositAPI.deployed();
            rocketDepositSettings = await RocketDepositSettings.deployed();

            // Get deposit settings
            let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());
            minDepositSize = parseInt(await rocketDepositSettings.getDepositMin.call());
            let chunksPerDeposit = parseInt(await rocketDepositSettings.getChunkAssignMax.call());

            // Get deposit scenario parameters
            numMinDeposits = Math.ceil(chunkSize / minDepositSize) * chunksPerDeposit;
            initialDepositSize = chunkSize * chunksPerDeposit * numMinDeposits;
            let minDepositsTotalSize = numMinDeposits * minDepositSize;


            //
            // Group
            //

            // Get new group fee
            let rocketGroupSettings = await RocketGroupSettings.deployed();
            let newGroupFee = parseInt(await rocketGroupSettings.getNewFee());

            // Create group
            let rocketGroupAPI = await RocketGroupAPI.deployed();
            let groupResult = await rocketGroupAPI.add('Group 1', web3.utils.toWei('0.05', 'ether'), {from: groupOwner, gas: 7500000, value: newGroupFee});

            // Get group contract
            groupContractAddress = groupResult.logs.filter(log => (log.event == 'GroupAdd'))[0].args.ID;
            let groupContract = await RocketGroupContract.at(groupContractAddress);

            // Create default group accessor
            let groupAccessorResult = await rocketGroupAPI.createDefaultAccessor(groupContractAddress, {from: groupOwner, gas: 7500000});

            // Get group accessor contract
            let groupAccessorContractAddress = groupAccessorResult.logs.filter(log => (log.event == 'GroupCreateDefaultAccessor'))[0].args.accessorAddress;
            groupAccessorContract = await RocketGroupAccessorContract.at(groupAccessorContractAddress);

            // Add accessor to group depositor / withdrawer list
            // Deposits to RocketDepositAPI can now be made through accessor contract
            await groupContract.addDepositor(groupAccessorContractAddress, {from: groupOwner, gas: 500000});
            await groupContract.addWithdrawer(groupAccessorContractAddress, {from: groupOwner, gas: 500000});


            //
            // Node
            //

            // Create node
            let rocketNodeAPI = await RocketNodeAPI.deployed();
            let nodeResult = await rocketNodeAPI.add('Australia/Brisbane', {from: nodeOperator, gas: 7500000});

            // Get node contract
            let nodeContractAddress = nodeResult.logs.filter(log => (log.event == 'NodeAdd'))[0].args.contractAddress;
            let nodeContract = await RocketNodeContract.at(nodeContractAddress);

            // Get node deposit amount
            let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
            let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
            let miniPoolMaxCreateCount = parseInt(await rocketMinipoolSettings.getMinipoolNewMaxAtOnce.call());
            let nodeDepositAmount = Math.floor(miniPoolLaunchAmount / 2) * miniPoolMaxCreateCount;

            // Get RPL token contract
            let rocketPoolToken = await RocketPoolToken.deployed();

            // Get deposit scenario parameters
            let minipoolsRequired = Math.ceil((initialDepositSize + minDepositsTotalSize) / Math.floor(miniPoolLaunchAmount / 2)) + 1;

            // Create minipools
            for (let mi = 0; mi < minipoolsRequired; mi += miniPoolMaxCreateCount) {

                // Reserve node deposit
                await nodeContract.depositReserve(nodeDepositAmount, '3m', {from: nodeOperator, gas: 500000});

                // Deposit required RPL
                let rplRequired = await nodeContract.getDepositReserveRPLRequired.call();
                await rocketPoolToken.mint(nodeContract.address, rplRequired, {from: owner, gas: 500000});

                // Deposit
                // Creates minipools ready for user deposit assignment
                await nodeContract.deposit({from: nodeOperator, gas: 7500000, value: nodeDepositAmount});

            }


        });


        // Staker can deposit via group depositor
        it(printTitle('staker', 'can deposit via group depositor'), async () => {

            // Make initial large deposit
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: initialDepositSize + 1,
                gas: 7500000,
            });

            // Make minimum deposits
            for (let di = 0; di < numMinDeposits + 1; ++di) {
                await scenarioDeposit({
                    depositorContract: groupAccessorContract,
                    durationID: '3m',
                    fromAddress: user1,
                    value: minDepositSize,
                    gas: 7500000,
                });
            }

        });


        // Staker cannot deposit with an invalid staking duration ID
        it(printTitle('staker', 'cannot deposit with an invalid staking duration ID'), async () => {
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: 'beer',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited with an invalid staking duration ID');
        });


        // Staker cannot deposit while deposits are disabled
        it(printTitle('staker', 'cannot deposit while deposits are disabled'), async () => {

            // Disable deposits
            await rocketDepositSettings.setDepositAllowed(false, {from: owner, gas: 500000});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited while deposits were disabled');

            // Reenable deposits
            await rocketDepositSettings.setDepositAllowed(true, {from: owner, gas: 500000});

        });


        // Staker cannot deposit under the minimum deposit amount
        it(printTitle('staker', 'cannot deposit under the minimum deposit amount'), async () => {

            // Set minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('1000', 'ether'), {from: owner, gas: 500000});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited under the minimum deposit amount');

            // Reset minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('0.5', 'ether'), {from: owner, gas: 500000});

        });


        // Staker cannot deposit over the maximum deposit amount
        it(printTitle('staker', 'cannot deposit over the maximum deposit amount'), async () => {

            // Set maximum deposit
            await rocketDepositSettings.setDepositMax(web3.utils.toWei('0.5', 'ether'), {from: owner, gas: 500000});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited over the maximum deposit amount');

            // Reset maximum deposit
            await rocketDepositSettings.setDepositMax(web3.utils.toWei('1000', 'ether'), {from: owner, gas: 500000});

        });


        // Staker cannot make empty deposit
        it(printTitle('staker', 'cannot make empty deposit'), async () => {

            // Set minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('0', 'ether'), {from: owner, gas: 500000});

            // Deposit
            await assertThrows(scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: 0,
                gas: 7500000,
            }), 'Made an empty deposit');

            // Reset minimum deposit
            await rocketDepositSettings.setDepositMin(web3.utils.toWei('0.5', 'ether'), {from: owner, gas: 500000});

        });


        // Staker cannot deposit via deposit API
        it(printTitle('staker', 'cannot deposit via deposit API'), async () => {

            // Invalid user ID
            await assertThrows(scenarioAPIDeposit({
                groupID: groupContractAddress,
                userID: '0x0000000000000000000000000000000000000000',
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited with an invalid user ID');

            // Invalid group ID
            await assertThrows(scenarioAPIDeposit({
                groupID: accounts[9],
                userID: user1,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited with an invalid group ID');

            // Valid parameters; invalid depositor
            await assertThrows(scenarioAPIDeposit({
                groupID: groupContractAddress,
                userID: user1,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited directly via RocketDepositAPI');

        });


        // Deposit ID for refunds
        let depositID;


        // Staker can refund a deposit
        it(printTitle('staker', 'can refund a deposit'), async () => {

            // Make deposit
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('500', 'ether'),
                gas: 7500000,
            });

            // Get deposit ID
            depositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContractAddress, user1, '3m', 0);

            // Request refund
            await scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                depositID,
                fromAddress: user1,
                gas: 500000,
            });

        });


        // Staker cannot refund a deposit with an invalid staking duration ID
        it(printTitle('staker', 'cannot refund a deposit with an invalid staking duration ID'), async () => {

            // Make deposit
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('500', 'ether'),
                gas: 7500000,
            });

            // Get deposit ID
            depositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContractAddress, user1, '3m', 0);

            // Request refund
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                durationID: 'beer',
                depositID,
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit with an invalid staking duration ID');

        });


        // Staker cannot refund a deposit with an invalid ID
        it(printTitle('staker', 'cannot refund a deposit with an invalid ID'), async () => {
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000000',
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit with an invalid ID');
        });


        // Staker cannot refund a deposit while refunds are disabled
        it(printTitle('staker', 'cannot refund a deposit while refunds are disabled'), async () => {

            // Disable refunds
            await rocketDepositSettings.setRefundDepositAllowed(false, {from: owner, gas: 500000});

            // Request refund
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                depositID,
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit while refunds were disabled');

            // Reenable refunds
            await rocketDepositSettings.setRefundDepositAllowed(true, {from: owner, gas: 500000});

        });


        // Staker cannot refund a nonexistant deposit
        it(printTitle('staker', 'cannot refund a nonexistant deposit'), async () => {

            // Nonexistant deposit ID
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                depositID: '0x0000000000000000000000000000000000000000000000000000000000000001',
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a nonexistant deposit');

            // Nonexistant user
            await assertThrows(scenarioRefundDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                depositID,
                fromAddress: user2,
                gas: 500000,
            }), 'Refunded a nonexistant deposit');

        });


        // Staker cannot refund a deposit via deposit API
        it(printTitle('staker', 'cannot refund a deposit via deposit API'), async () => {

            // Invalid user ID
            await assertThrows(scenarioAPIRefundDeposit({
                groupID: groupContractAddress,
                userID: '0x0000000000000000000000000000000000000000',
                durationID: '3m',
                depositID,
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit with an invalid user ID');

            // Invalid group ID
            await assertThrows(scenarioAPIRefundDeposit({
                groupID: accounts[9],
                userID: user1,
                durationID: '3m',
                depositID,
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit with an invalid group ID');

            // Valid parameters; invalid depositor
            await assertThrows(scenarioAPIRefundDeposit({
                groupID: groupContractAddress,
                userID: user1,
                durationID: '3m',
                depositID,
                fromAddress: user1,
                gas: 500000,
            }), 'Refunded a deposit directly via RocketDepositAPI');

        });


    });

}
