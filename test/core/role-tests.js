import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { hasRole } from './scenario-has-role';
import { transferRole } from './scenario-transfer-role';

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
        before(async () => {

        });


        //
        // Check our main two roles exist (should both be the same initially)
        //

        it(printTitle('rp', 'controls owner role'), async () => {
            await hasRole('owner', owner, {
                from: random,
            });
        });

        it(printTitle('rp', 'controls dao role'), async () => {
            await hasRole('dao', owner, {
                from: random,
            });
        });
        

        //
        // Transfer role to another address
        //

        
        it(printTitle('rp', 'can transfer owner role to another address'), async () => {
            await transferRole('owner', random, {
                from: owner,
            });
        });

        it(printTitle('rp', 'cannot transfer owner role more than once'), async () => {
            await transferRole('owner', random, {
                from: owner,
            });
            await shouldRevert(transferRole('owner', accounts[4], {
                from: owner,
            }), 'Transferred ownership twice');
        });

        it(printTitle('rp', 'can transfer owner role to another address and receive it back'), async () => {
            await transferRole('owner', random, {
                from: owner,
            });
            await transferRole('owner', owner, {
                from: random,
            });
        });

        it(printTitle('rp', 'cannot transfer owner role to the current owner address'), async () => {
            await shouldRevert(transferRole('owner', owner, {
                from: owner,
            }), 'Transferred ownership to the current owner address');
        });

        it(printTitle('rp', 'can transfer owner role to unretrievable address'), async () => {
            await transferRole('owner', '0x0000000000000000000000000000000000000001', {
                from: owner,
            });
        });

        it(printTitle('rp', 'cannot transfer role that does not exist'), async () => {
            await shouldRevert(transferRole('admin', owner, {
                from: owner,
            }), 'Transferred imaginary role');
        });

        it(printTitle('rp', 'cannot transfer ownership to an invalid address'), async () => {
            await shouldRevert(transferRole('owner', '0x0000000000000000000000000000000000000000', {
                from: owner,
            }), 'Transferred ownership to an invalid address');
        });

        it(printTitle('dao', 'can transfer owner role to another address'), async () => {
            await transferRole('dao', random, {
                from: owner,
            });
        });

        it(printTitle('random address', 'cannot transfer ownership to another address'), async () => {
            await shouldRevert(transferRole('owner', random, {
                from: random,
            }), 'Random address transferred ownership to another address');
        });


    });
}
