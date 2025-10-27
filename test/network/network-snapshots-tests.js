import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import {
    RocketNetworkSnapshots,
    RocketNetworkSnapshotsTime,
    RocketStorage,
    SnapshotTest,
    SnapshotTimeTest,
} from '../_utils/artifacts';
import { setDaoNodeTrustedBootstrapUpgrade } from '../dao/scenario-dao-node-trusted-bootstrap';
import { assertBN } from '../_helpers/bn';
import { globalSnapShot } from '../_utils/snapshotting';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNetworkSnapshots', () => {
        let owner;

        let snapshotTest;
        let snapshotTimeTest;
        let networkSnapshots;
        let networkSnapshotsTime;

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
            ] = await ethers.getSigners();

            // Add snapshot helper contracts
            const rocketStorage = await RocketStorage.deployed();

            snapshotTest = await SnapshotTest.new(rocketStorage.target, { from: owner });
            await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketSnapshotTest', SnapshotTest.abi, snapshotTest.target, {
                from: owner,
            });

            snapshotTimeTest = await SnapshotTimeTest.new(rocketStorage.target, { from: owner });
            await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketSnapshotTimeTest', SnapshotTimeTest.abi, snapshotTimeTest.target, {
                from: owner,
            });

            // Get contracts
            networkSnapshots = await RocketNetworkSnapshots.deployed();
            networkSnapshotsTime = await RocketNetworkSnapshotsTime.deployed();
        });

        it(printTitle('contract', 'can insert values into snapshot'), async () => {
            const blockNumber = await ethers.provider.getBlockNumber();
            await snapshotTest.push('test', '50'.BN); // block + 1
            await snapshotTest.push('test', '150'.BN); // block + 2
            await helpers.mine(2);
            await snapshotTest.push('test', '250'.BN); // block + 5

            assertBN.equal(await snapshotTest.lookup('test', blockNumber + 1), '50'.BN);
            assertBN.equal(await snapshotTest.lookup('test', blockNumber + 2), '150'.BN);
            assertBN.equal(await snapshotTest.lookup('test', blockNumber + 3), '150'.BN);
            assertBN.equal(await snapshotTest.lookup('test', blockNumber + 4), '150'.BN);
            assertBN.equal(await snapshotTest.lookup('test', blockNumber + 5), '250'.BN);
            assertBN.equal(await snapshotTest.lookupRecent('test', blockNumber + 1, 10), '50'.BN);
            assertBN.equal(await snapshotTest.lookupRecent('test', blockNumber + 2, 10), '150'.BN);
            assertBN.equal(await snapshotTest.lookupRecent('test', blockNumber + 3, 10), '150'.BN);
            assertBN.equal(await snapshotTest.lookupRecent('test', blockNumber + 4, 10), '150'.BN);
            assertBN.equal(await snapshotTest.lookupRecent('test', blockNumber + 5, 10), '250'.BN);
        });

        it(printTitle('contract', 'can insert values into time-based snapshot'), async () => {
            const startTime = await helpers.time.latest()
            await helpers.time.setNextBlockTimestamp(startTime + 12)
            await snapshotTimeTest.push('test', '50'.BN); // block + 12 s
            await helpers.time.setNextBlockTimestamp(startTime + 24)
            await snapshotTimeTest.push('test', '150'.BN); // block + 24 s
            await helpers.time.setNextBlockTimestamp(startTime + 60)
            await snapshotTimeTest.push('test', '250'.BN); // block + 60 s

            assertBN.equal(await snapshotTimeTest.lookup('test', startTime + 12), '50'.BN);
            assertBN.equal(await snapshotTimeTest.lookup('test', startTime + 24), '150'.BN);
            assertBN.equal(await snapshotTimeTest.lookup('test', startTime + 36), '150'.BN);
            assertBN.equal(await snapshotTimeTest.lookup('test', startTime + 48), '150'.BN);
            assertBN.equal(await snapshotTimeTest.lookup('test', startTime + 60), '250'.BN);
            assertBN.equal(await snapshotTimeTest.lookupRecent('test', startTime + 12, 10), '50'.BN);
            assertBN.equal(await snapshotTimeTest.lookupRecent('test', startTime + 24, 10), '150'.BN);
            assertBN.equal(await snapshotTimeTest.lookupRecent('test', startTime + 36, 10), '150'.BN);
            assertBN.equal(await snapshotTimeTest.lookupRecent('test', startTime + 48, 10), '150'.BN);
            assertBN.equal(await snapshotTimeTest.lookupRecent('test', startTime + 60, 10), '250'.BN);
        });
    });
}
