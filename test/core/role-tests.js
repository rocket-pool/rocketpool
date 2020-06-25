import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { addRole } from './scenario-add-role';
import { removeRole } from './scenario-remove-role';
import { transferOwnership } from './scenario-transfer-ownership';

export default function() {
    contract('RocketRole', async (accounts) => {


        // Accounts
        const [
            owner,
            admin1,
            admin2,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        before(async () => {

            // Register admins
            await addRole('admin', admin1, {from: owner});
            await addRole('admin', admin2, {from: owner});

        });


        //
        // Add role
        //


        it(printTitle('admin', 'can add a role to an address'), async () => {
            await addRole('admin', random, {
                from: admin1,
            });
        });


        it(printTitle('admin', 'cannot add the owner role to an address'), async () => {
            await shouldRevert(addRole('owner', random, {
                from: admin1,
            }), 'Added the owner role to an address');
        });


        it(printTitle('admin', 'cannot add a role to an invalid address'), async () => {
            await shouldRevert(addRole('admin', '0x0000000000000000000000000000000000000000', {
                from: admin1,
            }), 'Added a role to an invalid address');
        });


        it(printTitle('admin', 'cannot add a role to an address which already has it'), async () => {
            await shouldRevert(addRole('admin', admin2, {
                from: admin1,
            }), 'Added a role to an address which already has it');
        });


        it(printTitle('random address', 'cannot add a role to an address'), async () => {
            await shouldRevert(addRole('admin', random, {
                from: random,
            }), 'Random address added a role to an address');
        });


        //
        // Remove role
        //


        it(printTitle('admin', 'can remove a role from an address'), async () => {
            await removeRole('admin', admin2, {
                from: admin1,
            });
        });


        it(printTitle('admin', 'cannot remove a role from the owner address'), async () => {
            await shouldRevert(removeRole('owner', owner, {
                from: admin1,
            }), 'Removed a role from the owner address');
        });


        it(printTitle('admin', 'cannot remove a role from an address which does not have it'), async () => {
            await shouldRevert(removeRole('admin', random, {
                from: admin1,
            }), 'Removed a role from an address which did not have it');
        });


        it(printTitle('random address', 'cannot remove a role from an address'), async () => {
            await shouldRevert(removeRole('admin', admin2, {
                from: random,
            }), 'Random address removed a role from an address');
        });


        //
        // Transfer ownership
        //


        it(printTitle('owner', 'can transfer ownership to another address'), async () => {
            await transferOwnership(random, {
                from: owner,
            });
        });


        it(printTitle('owner', 'cannot transfer ownership to an invalid address'), async () => {
            await shouldRevert(transferOwnership('0x0000000000000000000000000000000000000000', {
                from: owner,
            }), 'Transferred ownership to an invalid address');
        });


        it(printTitle('owner', 'cannot transfer ownership to the current owner address'), async () => {
            await shouldRevert(transferOwnership(owner, {
                from: owner,
            }), 'Transferred ownership to the current owner address');
        });


        it(printTitle('random address', 'cannot transfer ownership to another address'), async () => {
            await shouldRevert(transferOwnership(random, {
                from: random,
            }), 'Random address transferred ownership to another address');
        });


    });
}
