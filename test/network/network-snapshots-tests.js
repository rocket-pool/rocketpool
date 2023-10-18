import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    RocketNetworkSnapshots, RocketStorage, SnapshotTest,
} from '../_utils/artifacts';
import {
    setDaoNodeTrustedBootstrapUpgrade,
} from '../dao/scenario-dao-node-trusted-bootstrap';
import { assertBN } from '../_helpers/bn';
import { upgradeOneDotThree } from '../_utils/upgrade';

export default function() {
    contract('RocketNetworkSnapshots', async (accounts) => {


        // Accounts
        const [
            owner,
        ] = accounts;

        let snapshotTest;
        let networkSnapshots;

        // Setup
        before(async () => {
            await upgradeOneDotThree();

            // Add penalty helper contract
            const rocketStorage = await RocketStorage.deployed();
            snapshotTest = await SnapshotTest.new(rocketStorage.address, {from: owner});
            await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketSnapshotTest', snapshotTest.abi, snapshotTest.address, {
                from: owner,
            });

            // Get contracts
            networkSnapshots = await RocketNetworkSnapshots.deployed();
        });


        it(printTitle('contract', 'can insert values into snapshot'), async () => {
            await snapshotTest.push("test", 1, "50".BN);
            await snapshotTest.push("test", 2, "150".BN);
            await snapshotTest.push("test", 5, "250".BN);

            assertBN.equal(await snapshotTest.lookup("test", 1), "50".BN);
            assertBN.equal(await snapshotTest.lookup("test", 2), "150".BN);
            assertBN.equal(await snapshotTest.lookup("test", 3), "150".BN);
            assertBN.equal(await snapshotTest.lookup("test", 4), "150".BN);
            assertBN.equal(await snapshotTest.lookup("test", 5), "250".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", 1, 10), "50".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", 2, 10), "150".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", 3, 10), "150".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", 4, 10), "150".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", 5, 10), "250".BN);
        });


        it(printTitle('contract', 'can update head value'), async () => {
            await snapshotTest.push("test", 1, "50".BN);
            await snapshotTest.push("test", 1, "150".BN);

            assertBN.equal(await snapshotTest.lookup("test", 1), "150".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", 1, 10), "150".BN);
        });


        it(printTitle('contract', 'can not insert older values than head'), async () => {
            await snapshotTest.push("test", 10, "50".BN);
            await shouldRevert(snapshotTest.push("test", 2, "150".BN), "Was able to insert older value", "Unordered snapshot insertion");
        });


        // it.only(printTitle('contract', 'gas check'), async () => {
        //     for (let i = 0; i < 100; i++) {
        //         await snapshotTest.push("test", i, (i * 100).toString().BN);
        //     }
        //
        //     for (let x = 0; x < 100; x++) {
        //         const lookup = (await snapshotTest.lookupGas("test", x)).toString();
        //         const lookupRecent = (await snapshotTest.lookupRecentGas("test", x, 5)).toString();
        //
        //         console.log(`${x}, ${lookup}, ${lookupRecent}`);
        //     }
        // });
    });
}
