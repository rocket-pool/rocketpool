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
import { mineBlocks } from '../_utils/evm';

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
            // Upgrade to Houston
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
            const blockNumber = await hre.web3.eth.getBlockNumber()
            await snapshotTest.push("test", "50".BN); // block + 1
            await snapshotTest.push("test", "150".BN); // block + 2
            await mineBlocks(hre.web3, 2)
            await snapshotTest.push("test", "250".BN); // block + 5

            assertBN.equal(await snapshotTest.lookup("test", blockNumber + 1), "50".BN);
            assertBN.equal(await snapshotTest.lookup("test", blockNumber + 2), "150".BN);
            assertBN.equal(await snapshotTest.lookup("test", blockNumber + 3), "150".BN);
            assertBN.equal(await snapshotTest.lookup("test", blockNumber + 4), "150".BN);
            assertBN.equal(await snapshotTest.lookup("test", blockNumber + 5), "250".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", blockNumber + 1, 10), "50".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", blockNumber + 2, 10), "150".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", blockNumber + 3, 10), "150".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", blockNumber + 4, 10), "150".BN);
            assertBN.equal(await snapshotTest.lookupRecent("test", blockNumber + 5, 10), "250".BN);
        });
    });
}
