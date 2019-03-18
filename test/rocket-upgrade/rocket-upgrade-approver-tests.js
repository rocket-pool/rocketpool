import { printTitle, assertThrows } from '../_lib/utils/general';
import { scenarioInitialiseUpgradeApprovers, scenarioTransferUpgradeApprover } from './rocket-upgrade-scenarios';

export default function() {

    contract('RocketUpgrade', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const approver1 = accounts[1];
        const approver2 = accounts[2];
        const approver3 = accounts[3];
        const approver4 = accounts[4];
        const approver5 = accounts[5];
        const user1 = accounts[6];


        // Owner cannot initialise upgrade approvers with an invalid approver list
        it(printTitle('owner', 'cannot initialise upgrade approvers with an invalid approver list'), async () => {

            // Invalid length
            await assertThrows(scenarioInitialiseUpgradeApprovers({
                approvers: [approver1, approver2],
                fromAddress: owner,
            }), 'Upgrade approvers were initialised with an invalid list length');

            // Invalid address
            await assertThrows(scenarioInitialiseUpgradeApprovers({
                approvers: ['0x0000000000000000000000000000000000000000', approver2, approver3],
                fromAddress: owner,
            }), 'Upgrade approvers were initialised with an invalid address');

            // Duplicate address
            await assertThrows(scenarioInitialiseUpgradeApprovers({
                approvers: [approver1, approver1, approver2],
                fromAddress: owner,
            }), 'Upgrade approvers were initialised with a duplicate address');

        });


        // Random account cannot initialise upgrade approvers
        it(printTitle('random account', 'cannot initialise upgrade approvers'), async () => {
            await assertThrows(scenarioInitialiseUpgradeApprovers({
                approvers: [approver1, approver2, approver3],
                fromAddress: user1,
            }), 'Random account initialised upgrade approvers');
        });


        // Owner can initialise upgrade approvers
        it(printTitle('owner', 'can initialise upgrade approvers'), async () => {
            await scenarioInitialiseUpgradeApprovers({
                approvers: [approver1, approver2, approver3],
                fromAddress: owner,
            });
        });


        // Owner cannot initialise upgrade approvers if already initialised
        it(printTitle('owner', 'cannot initialise upgrade approvers if already initialised'), async () => {
            await assertThrows(scenarioInitialiseUpgradeApprovers({
                approvers: [approver1, approver2, approver3],
                fromAddress: owner,
            }), 'Initialised upgrade approvers when already initialised');
        });


        // Random account cannot initialise an approver transfer
        it(printTitle('random account', 'cannot initialise an approver transfer'), async () => {
            await assertThrows(scenarioTransferUpgradeApprover({
                oldAddress: approver3,
                newAddress: approver4,
                fromAddress: user1,
            }), 'Random account initialised an approver transfer');
        });


        // Upgrade approver cannot initialise an approver transfer with invalid addresses
        it(printTitle('upgrade approver', 'cannot initialise an approver transfer with invalid addresses'), async () => {

            // Invalid new address
            await assertThrows(scenarioTransferUpgradeApprover({
                oldAddress: approver3,
                newAddress: '0x0000000000000000000000000000000000000000',
                fromAddress: approver1,
            }), 'Initialised an approver transfer with an invalid new address');

            // Duplicate new address
            await assertThrows(scenarioTransferUpgradeApprover({
                oldAddress: approver3,
                newAddress: approver2,
                fromAddress: approver1,
            }), 'Initialised an approver transfer with a duplicate new address');

            // Invalid old address
            await assertThrows(scenarioTransferUpgradeApprover({
                oldAddress: approver4,
                newAddress: approver5,
                fromAddress: approver1,
            }), 'Initialisd an approver transfer with an invalid old address');

        });


        // Upgrade approver can initialise an approver transfer
        it(printTitle('upgrade approver', 'can initialise an approver transfer'), async () => {
            await scenarioTransferUpgradeApprover({
                oldAddress: approver3,
                newAddress: approver4,
                fromAddress: approver1,
            });
        });


        // Upgrade approver cannot complete their own approver transfer
        it(printTitle('upgrade approver', 'cannot complete their own approver transfer'), async () => {
            await assertThrows(scenarioTransferUpgradeApprover({
                oldAddress: approver3,
                newAddress: approver4,
                fromAddress: approver1,
            }), 'Approver completed their own approver transfer');
        });


        // Upgrade approver can complete another approver's approver transfer
        it(printTitle('upgrade approver', 'can complete another approver\'s approver transfer'), async () => {
            await scenarioTransferUpgradeApprover({
                oldAddress: approver3,
                newAddress: approver4,
                fromAddress: approver2,
            });
        });


    });

};
