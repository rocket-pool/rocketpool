import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketGroupAPI, RocketGroupAccessorContract, RocketGroupContract, RocketGroupSettings, RocketMinipoolSettings, RocketNodeAPI, RocketNodeContract, RocketPoolToken } from '../_lib/artifacts';
import { scenarioDeposit, scenarioAPIDeposit } from './rocket-deposit-api-scenarios';

export default function() {

    contract('RocketDepositAPI', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const nodeOperator = accounts[2];
        const user1 = accounts[3];


        // Setup
        let groupContractAddress;
        let groupAccessorContract;
        before(async () => {

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

            // Reserve node deposit
            await nodeContract.depositReserve(nodeDepositAmount, '3m', {from: nodeOperator, gas: 500000});

            // Deposit required RPL
            let rplRequired = await nodeContract.getDepositReserveRPLRequired.call();
            let rocketPoolToken = await RocketPoolToken.deployed();
            await rocketPoolToken.mint(nodeContract.address, rplRequired, {from: owner, gas: 500000});

            // Deposit
            // Creates minipools ready for user deposit assignment
            await nodeContract.deposit({from: nodeOperator, gas: 7500000, value: nodeDepositAmount});

        });


        // Random account can deposit via group depositor
        it(printTitle('random account', 'can deposit via group depositor'), async () => {
            await scenarioDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            });
        });


        // Random account cannot deposit via deposit API
        it(printTitle('random account', 'cannot deposit via deposit API'), async () => {
            await assertThrows(scenarioAPIDeposit({
                groupID: groupContractAddress,
                userID: user1,
                durationID: '3m',
                fromAddress: user1,
                value: web3.utils.toWei('16', 'ether'),
                gas: 7500000,
            }), 'Deposited directly via RocketDepositAPI');
        });


    });

}
