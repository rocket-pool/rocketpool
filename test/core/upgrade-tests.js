import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { RocketStorage, RocketUpgrade, RocketMinipoolManager, RocketNodeManager } from '../_utils/artifacts';
import { upgradeContract } from './scenario-upgrade-contract';
import { addContract } from './scenario-add-contract';
import { upgradeABI } from './scenario-upgrade-abi';
import { addABI } from './scenario-add-abi';

export default function() {
    contract('RocketUpgrade', async (accounts) => {


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
        let rocketMinipoolManagerNew;
        let rocketUpgradeNew;
        before(async () => {

            // Get RocketStorage
            const rocketStorage = await RocketStorage.deployed();

            // Deploy new contracts
            rocketMinipoolManagerNew = await RocketMinipoolManager.new(rocketStorage.address, {from: owner});
            rocketUpgradeNew = await RocketUpgrade.new(rocketStorage.address, {from: owner});

        });


        //
        // Contracts
        //


        it(printTitle('admin', 'can upgrade a contract'), async () => {
            await upgradeContract('rocketNodeManager', rocketMinipoolManagerNew.address, rocketMinipoolManagerNew.abi, {
                from: owner,
            });
        });


        it(printTitle('admin', 'can upgrade the upgrade contract'), async () => {
            await upgradeContract('rocketUpgrade', rocketUpgradeNew.address, rocketUpgradeNew.abi, {
                from: owner,
            });
        });


        it(printTitle('admin', 'cannot upgrade a protected contract'), async () => {
            await shouldRevert(upgradeContract('rocketVault', rocketMinipoolManagerNew.address, rocketMinipoolManagerNew.abi, {
                from: owner,
            }), 'Upgraded a protected contract');
        });


        it(printTitle('admin', 'cannot upgrade a contract which does not exist'), async () => {
            await shouldRevert(upgradeContract('fooBarBaz', rocketMinipoolManagerNew.address, rocketMinipoolManagerNew.abi, {
                from: owner,
            }), 'Upgraded a contract which did not exist');
        });


        it(printTitle('admin', 'cannot upgrade a contract with an invalid address'), async () => {
            await shouldRevert(upgradeContract('rocketNodeManager', '0x0000000000000000000000000000000000000000', rocketMinipoolManagerNew.abi, {
                from: owner,
            }), 'Upgraded a contract with an invalid address');
        });


        it(printTitle('admin', 'cannot upgrade a contract with its current address'), async () => {
            const rocketNodeManager = await RocketNodeManager.deployed();
            await shouldRevert(upgradeContract('rocketNodeManager', rocketNodeManager.address, rocketMinipoolManagerNew.abi, {
                from: owner,
            }), 'Upgraded a contract with its current address');
        });


        it(printTitle('random address', 'cannot upgrade a contract'), async () => {
            await shouldRevert(upgradeContract('rocketNodeManager', rocketMinipoolManagerNew.address, rocketMinipoolManagerNew.abi, {
                from: random,
            }), 'Random address upgraded a contract');
        });


        it(printTitle('admin', 'can add a new contract'), async () => {
            await addContract('rocketNewFeature', rocketMinipoolManagerNew.address, rocketMinipoolManagerNew.abi, {
                from: owner,
            });
        });


        it(printTitle('admin', 'cannot add a new contract with an invalid name'), async () => {
            await shouldRevert(addContract('', rocketMinipoolManagerNew.address, rocketMinipoolManagerNew.abi, {
                from: owner,
            }), 'Added a new contract with an invalid name');
        });


        it(printTitle('admin', 'cannot add a new contract with an existing name'), async () => {
            await shouldRevert(addContract('rocketNodeManager', rocketMinipoolManagerNew.address, rocketMinipoolManagerNew.abi, {
                from: owner,
            }), 'Added a new contract with an existing name');
        });


        it(printTitle('admin', 'cannot add a new contract with an existing address'), async () => {
            const rocketNodeManager = await RocketNodeManager.deployed();
            await shouldRevert(addContract('rocketNewFeature', rocketNodeManager.address, rocketMinipoolManagerNew.abi, {
                from: owner,
            }), 'Added a new contract with an existing address');
        });


        it(printTitle('random address', 'cannot add a new contract'), async () => {
            await shouldRevert(addContract('rocketNewFeature', rocketMinipoolManagerNew.address, rocketMinipoolManagerNew.abi, {
                from: random,
            }), 'Random address added a new contract');
        });


        //
        // ABIs
        //


        it(printTitle('admin', 'can upgrade a contract ABI'), async () => {
            await upgradeABI('rocketMinipool', rocketMinipoolManagerNew.abi, {
                from: owner,
            });
        });


        it(printTitle('admin', 'cannot upgrade a contract ABI which does not exist'), async () => {
            await shouldRevert(upgradeABI('fooBarBaz', rocketMinipoolManagerNew.abi, {
                from: owner,
            }), 'Upgraded a contract ABI which did not exist');
        });


        it(printTitle('random address', 'cannot upgrade a contract ABI'), async () => {
            await shouldRevert(upgradeABI('rocketMinipool', rocketMinipoolManagerNew.abi, {
                from: random,
            }), 'Random address upgraded a contract ABI');
        });


        it(printTitle('admin', 'can add a new contract ABI'), async () => {
            await addABI('rocketNewFeature', rocketMinipoolManagerNew.abi, {
                from: owner,
            });
        });


        it(printTitle('admin', 'cannot add a new contract ABI with an invalid name'), async () => {
            await shouldRevert(addABI('', rocketMinipoolManagerNew.abi, {
                from: owner,
            }), 'Added a new contract ABI with an invalid name');
        });


        it(printTitle('admin', 'cannot add a new contract ABI with an existing name'), async () => {
            await shouldRevert(addABI('rocketMinipool', rocketMinipoolManagerNew.abi, {
                from: owner,
            }), 'Added a new contract ABI with an existing name');
        });


        it(printTitle('random address', 'cannot add a new contract ABI'), async () => {
            await shouldRevert(addABI('rocketNewFeature', rocketMinipoolManagerNew.abi, {
                from: random,
            }), 'Random address added a new contract ABI');
        });


    });
}
