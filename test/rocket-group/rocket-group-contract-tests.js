import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketGroupAPI, RocketGroupContract, RocketGroupSettings } from '../_lib/artifacts';
import { scenarioSetFeePerc, scenarioAddDepositor, scenarioRemoveDepositor, scenarioAddWithdrawer, scenarioRemoveWithdrawer } from './rocket-group-contract-scenarios';

export default function() {

    contract('RocketGroupContract', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];


        // Setup
        let groupContract;
        let accessor1Address;
        let accessor2Address;
        let accessor3Address;
        before(async () => {

            // Get new group fee
            let rocketGroupSettings = await RocketGroupSettings.deployed();
            let newGroupFee = parseInt(await rocketGroupSettings.getNewFee());

            // Create group
            let rocketGroupAPI = await RocketGroupAPI.deployed();
            let groupResult = await rocketGroupAPI.add('Group 1', web3.utils.toWei('0', 'ether'), {from: groupOwner, gas: 7500000, value: newGroupFee});

            // Get group contract
            let groupContractAddress = groupResult.logs.filter(log => (log.event == 'GroupAdd'))[0].args.ID;
            groupContract = await RocketGroupContract.at(groupContractAddress);

            // Create default accessor contracts
            let accessorResult1 = await rocketGroupAPI.createDefaultAccessor(groupContractAddress, {from: groupOwner, gas: 7500000});
            let accessorResult2 = await rocketGroupAPI.createDefaultAccessor(groupContractAddress, {from: groupOwner, gas: 7500000});
            let accessorResult3 = await rocketGroupAPI.createDefaultAccessor(groupContractAddress, {from: groupOwner, gas: 7500000});

            // Get accessor contract addresses
            accessor1Address = accessorResult1.logs.filter(log => (log.event == 'GroupCreateDefaultAccessor'))[0].args.accessorAddress;
            accessor2Address = accessorResult2.logs.filter(log => (log.event == 'GroupCreateDefaultAccessor'))[0].args.accessorAddress;
            accessor3Address = accessorResult3.logs.filter(log => (log.event == 'GroupCreateDefaultAccessor'))[0].args.accessorAddress;

        });


        // Group owner can set the group's fee percentage
        it(printTitle('group owner', 'can set the group\'s fee percentage'), async () => {
            await scenarioSetFeePerc({
                groupContract,
                stakingFee: web3.utils.toWei('0.5', 'ether'),
                fromAddress: groupOwner,
                gas: 500000,
            });
        });


        // Group owner cannot set an invalid fee percentage
        it(printTitle('group owner', 'cannot set an invalid fee percentage'), async () => {
            await assertThrows(scenarioSetFeePerc({
                groupContract,
                stakingFee: web3.utils.toWei('1.05', 'ether'),
                fromAddress: groupOwner,
                gas: 500000,
            }), 'Set an invalid fee percentage');
        });


        // Random account cannot set the group's fee percentage
        it(printTitle('random account', 'cannot set the group\'s fee percentage'), async () => {
            await assertThrows(scenarioSetFeePerc({
                groupContract,
                stakingFee: web3.utils.toWei('0.1', 'ether'),
                fromAddress: accounts[9],
                gas: 500000,
            }), 'Random account set the group\'s fee percentage');
        });


        // Group owner can add a depositor to the group
        it(printTitle('group owner', 'can add a depositor to the group'), async () => {
            await scenarioAddDepositor({
                groupContract,
                depositorAddress: accessor1Address,
                fromAddress: groupOwner,
                gas: 500000,
            });
            await scenarioAddDepositor({
                groupContract,
                depositorAddress: accessor2Address,
                fromAddress: groupOwner,
                gas: 500000,
            });
        });


        // Group owner cannot add an existing depositor to the group
        it(printTitle('group owner', 'cannot add an existing depositor to the group'), async () => {
            await assertThrows(scenarioAddDepositor({
                groupContract,
                depositorAddress: accessor1Address,
                fromAddress: groupOwner,
                gas: 500000,
            }), 'Added an existing depositor to the group');
        });


        // Random account cannot add a depositor to the group
        it(printTitle('random account', 'cannot add a depositor to the group'), async () => {
            await assertThrows(scenarioAddDepositor({
                groupContract,
                depositorAddress: accessor3Address,
                fromAddress: accounts[9],
                gas: 500000,
            }), 'Random account added a depositor to the group');
        });


        // Group owner can remove a depositor from the group
        it(printTitle('group owner', 'can remove a depositor from the group'), async () => {
            await scenarioRemoveDepositor({
                groupContract,
                depositorAddress: accessor2Address,
                fromAddress: groupOwner,
                gas: 500000,
            });
        });


        // Group owner cannot remove a nonexistant depositor from the group
        it(printTitle('group owner', 'cannot remove a nonexistant depositor from the group'), async () => {
            await assertThrows(scenarioRemoveDepositor({
                groupContract,
                depositorAddress: accessor2Address,
                fromAddress: groupOwner,
                gas: 500000,
            }), 'Removed a nonexistant depositor from the group');
        });


        // Random account cannot remove a depositor from the group
        it(printTitle('random account', 'cannot remove a depositor from the group'), async () => {
            await assertThrows(scenarioRemoveDepositor({
                groupContract,
                depositorAddress: accessor1Address,
                fromAddress: accounts[9],
                gas: 500000,
            }), 'Random account removed a depositor from the group');
        });


        // Group owner can add a withdrawer to the group
        it(printTitle('group owner', 'can add a withdrawer to the group'), async () => {
            await scenarioAddWithdrawer({
                groupContract,
                withdrawerAddress: accessor1Address,
                fromAddress: groupOwner,
                gas: 500000,
            });
            await scenarioAddWithdrawer({
                groupContract,
                withdrawerAddress: accessor2Address,
                fromAddress: groupOwner,
                gas: 500000,
            });
        });


        // Group owner cannot add an existing withdrawer to the group
        it(printTitle('group owner', 'cannot add an existing withdrawer to the group'), async () => {
            await assertThrows(scenarioAddWithdrawer({
                groupContract,
                withdrawerAddress: accessor1Address,
                fromAddress: groupOwner,
                gas: 500000,
            }), 'Added an existing withdrawer to the group');
        });


        // Random account cannot add a withdrawer to the group
        it(printTitle('random account', 'cannot add a withdrawer to the group'), async () => {
            await assertThrows(scenarioAddWithdrawer({
                groupContract,
                withdrawerAddress: accessor3Address,
                fromAddress: accounts[9],
                gas: 500000,
            }), 'Random account added a withdrawer to the group');
        });


        // Group owner can remove a withdrawer from the group
        it(printTitle('group owner', 'can remove a withdrawer from the group'), async () => {
            await scenarioRemoveWithdrawer({
                groupContract,
                withdrawerAddress: accessor2Address,
                fromAddress: groupOwner,
                gas: 500000,
            });
        });


        // Group owner cannot remove the last withdrawer from the group
        it(printTitle('group owner', 'cannot remove the last withdrawer from the group'), async () => {

            // Attempt removal
            await assertThrows(scenarioRemoveWithdrawer({
                groupContract,
                withdrawerAddress: accessor1Address,
                fromAddress: groupOwner,
                gas: 500000,
            }), 'Removed the last withdrawer from the group');

            // Add withdrawer
            await scenarioAddWithdrawer({
                groupContract,
                withdrawerAddress: accessor3Address,
                fromAddress: groupOwner,
                gas: 500000,
            });

        });


        // Group owner cannot remove a nonexistant withdrawer from the group
        it(printTitle('group owner', 'cannot remove a nonexistant withdrawer from the group'), async () => {
            await assertThrows(scenarioRemoveWithdrawer({
                groupContract,
                withdrawerAddress: accessor2Address,
                fromAddress: groupOwner,
                gas: 500000,
            }), 'Removed a nonexistant withdrawer from the group');
        });


        // Random account cannot remove a withdrawer from the group
        it(printTitle('random account', 'cannot remove a withdrawer from the group'), async () => {
            await assertThrows(scenarioRemoveWithdrawer({
                groupContract,
                withdrawerAddress: accessor1Address,
                fromAddress: accounts[9],
                gas: 500000,
            }), 'Random account removed a withdrawer from the group');
        });


    });

};
