import { printTitle, assertThrows } from '../_lib/utils/general';
import { scenarioAddRole, scenarioRemoveRole, scenarioTransferOwnership } from './rocket-role-scenarios';

export default function() {

    contract('RocketRole', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const tester1 = accounts[1];
        const tester2 = accounts[2];
        const newOwner = accounts[3];


        // Owner can add a role to an address
        it(printTitle('owner', 'can add a role to an address'), async () => {
            await scenarioAddRole({
                role: 'tester',
                address: tester1,
                fromAddress: owner,
            });
        });


        // Owner cannot add an existing role to an address
        it(printTitle('owner', 'cannot add an existing role to an address'), async () => {
            await assertThrows(scenarioAddRole({
                role: 'tester',
                address: tester1,
                fromAddress: owner,
            }), 'Added an existing role to an address');
        });


        // Owner cannot add a role to an invalid address
        it(printTitle('owner', 'cannot add a role to an invalid address'), async () => {
            await assertThrows(scenarioAddRole({
                role: 'tester',
                address: '0x0000000000000000000000000000000000000000',
                fromAddress: owner,
            }), 'Added a role to an invalid address');
        });


        // Owner cannot add the owner role to an address
        it(printTitle('owner', 'cannot add the owner role to an address'), async () => {
            await assertThrows(scenarioAddRole({
                role: 'owner',
                address: tester1,
                fromAddress: owner,
            }), 'Added the owner role to an address');
        });


        // Random account cannot add a role to an address
        it(printTitle('random account', 'cannot add a role to an address'), async () => {
            await assertThrows(scenarioAddRole({
                role: 'tester',
                address: tester2,
                fromAddress: accounts[9],
            }), 'Random account added a role to an address');
        });


        // Owner can remove a role from an address
        it(printTitle('owner', 'can remove a role from an address'), async () => {

            // Add role
            await scenarioAddRole({
                role: 'tester',
                address: tester2,
                fromAddress: owner,
            });

            // Remove role
            await scenarioRemoveRole({
                role: 'tester',
                address: tester2,
                fromAddress: owner,
            });

        });


        // Owner cannot remove a nonexistant role from an address
        it(printTitle('owner', 'cannot remove a nonexistant role from an address'), async () => {
            await assertThrows(scenarioRemoveRole({
                role: 'tester',
                address: tester2,
                fromAddress: owner,
            }), 'Removed a nonexistant role from an address');
        });


        // Owner cannot remove a role from the owner address
        it(printTitle('owner', 'cannot remove a role from the owner address'), async () => {
            await assertThrows(scenarioRemoveRole({
                role: 'owner',
                address: owner,
                fromAddress: owner,
            }), 'Removed a role from the owner address');
        });


        // Random account cannot remove a role from an address
        it(printTitle('random account', 'cannot remove a role from an address'), async () => {

            // Add role
            await scenarioAddRole({
                role: 'tester',
                address: tester2,
                fromAddress: owner,
            });

            // Remove role
            await assertThrows(scenarioRemoveRole({
                role: 'tester',
                address: tester2,
                fromAddress: accounts[9],
            }), 'Random account removed a role from an address');

        });


        // Owner cannot transfer ownership role to an invalid address
        it(printTitle('owner', 'cannot transfer ownership role to an invalid address'), async () => {
            await assertThrows(scenarioTransferOwnership({
                toAddress: '0x0000000000000000000000000000000000000000',
                fromAddress: owner,
            }), 'Transferred ownership role to an invalid address');
        });


        // Owner cannot transfer ownership to themselves
        it(printTitle('owner', 'cannot transfer ownership to themselves'), async () => {
            await assertThrows(scenarioTransferOwnership({
                toAddress: owner,
                fromAddress: owner,
            }), 'Owner transferred ownership to themselves');
        });


        // Random account cannot transfer ownership role
        it(printTitle('random account', 'cannot transfer ownership role'), async () => {
            await assertThrows(scenarioTransferOwnership({
                toAddress: newOwner,
                fromAddress: accounts[9],
            }), 'Random account transferred ownership role');
        });


        // Owner can transfer ownership role
        it(printTitle('owner', 'can transfer ownership role'), async () => {
            await scenarioTransferOwnership({
                toAddress: newOwner,
                fromAddress: owner,
            });
        });


    });

}
