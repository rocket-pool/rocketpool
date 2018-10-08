import { printTitle, assertThrows } from '../_lib/utils/general';
import { createGroupContract, createGroupAccessorContract } from '../_helpers/rocket-group';
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

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0', 'ether'), groupOwner});

            // Create default accessor contracts
            accessor1Address = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            accessor2Address = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            accessor3Address = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});

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
