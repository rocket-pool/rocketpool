import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { hasRole } from './scenario-has-role';
import { transferRole } from './scenario-transfer-role';

export default function() {
    contract('RocketRole', async (accounts) => {


        // Accounts
        const [
            rp,
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

        it(printTitle('rp', 'controls rp role'), async () => {
            await hasRole('rp', rp, {
                from: random,
            });
        });

        it(printTitle('rp', 'controls dao role'), async () => {
            await hasRole('dao', rp, {
                from: random,
            });
        });
        

        //
        // Transfer role to another address
        //

        
        it(printTitle('rp', 'can transfer rp role to another address'), async () => {
            await transferRole('rp', random, {
                from: rp,
            });
        });

        it(printTitle('rp', 'cannot transfer rp role more than once'), async () => {
            await transferRole('rp', random, {
                from: rp,
            });
            await shouldRevert(transferRole('rp', accounts[4], {
                from: rp,
            }), 'Transferred ownership twice');
        });

        it(printTitle('rp', 'can transfer rp role to another address and receive it back'), async () => {
            await transferRole('rp', random, {
                from: rp,
            });
            await transferRole('rp', rp, {
                from: random,
            });
        });

        it(printTitle('rp', 'cannot transfer rp role to the current rp address'), async () => {
            await shouldRevert(transferRole('rp', rp, {
                from: rp,
            }), 'Transferred ownership to the current rp address');
        });

        it(printTitle('rp', 'can transfer rp role to irretrievable address'), async () => {
            await transferRole('rp', '0x0000000000000000000000000000000000000001', {
                from: rp,
            });
        });

        it(printTitle('rp', 'cannot transfer role that does not exist'), async () => {
            await shouldRevert(transferRole('admin', rp, {
                from: rp,
            }), 'Transferred imaginary role');
        });

        it(printTitle('rp', 'cannot transfer ownership to an invalid address'), async () => {
            await shouldRevert(transferRole('rp', '0x0000000000000000000000000000000000000000', {
                from: rp,
            }), 'Transferred ownership to an invalid address');
        });

        it(printTitle('dao', 'can transfer rp role to another address'), async () => {
            await transferRole('dao', random, {
                from: rp,
            });
        });

        it(printTitle('random address', 'cannot transfer ownership to another address'), async () => {
            await shouldRevert(transferRole('rp', random, {
                from: random,
            }), 'Random address transferred ownership to another address');
        });


    });
}
