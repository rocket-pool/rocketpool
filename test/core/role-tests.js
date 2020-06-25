import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';

export default function() {
    contract('RocketRole', async (accounts) => {


        // Accounts
        const [
            owner,
            random,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        before(async () => {});


        //
        // Add role
        //


        it(printTitle('admin', 'can add a role to an address'));


        it(printTitle('admin', 'cannot add the owner role to an address'));


        it(printTitle('admin', 'cannot add a role to an invalid address'));


        it(printTitle('admin', 'cannot add a role to an address which already has it'));


        it(printTitle('random address', 'can add a role to an address'));


        //
        // Remove role
        //


        it(printTitle('admin', 'can remove a role from an address'));


        it(printTitle('admin', 'cannot remove a role from the owner address'));


        it(printTitle('admin', 'cannot remove a role from an address which does not have it'));


        it(printTitle('random address', 'cannot remove a role from an address'));


        //
        // Transfer ownership
        //


        it(printTitle('owner', 'can transfer ownership to another address'));


        it(printTitle('owner', 'cannot transfer ownership to an invalid address'));


        it(printTitle('owner', 'cannot transfer ownership to itself'));


        it(printTitle('random address', 'cannot transfer ownership to another address'));


    });
}
