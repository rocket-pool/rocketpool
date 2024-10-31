import { artifacts, RocketStorage } from '../../test/_utils/artifacts';
import pako from 'pako';

const networkContracts = {
    rocketMegapoolDelegate: artifacts.require('RocketMegapoolDelegate'),
    rocketMegapoolFactory: artifacts.require('RocketMegapoolFactory'),
    rocketMegapoolProxy: artifacts.require('RocketMegapoolProxy'),
    rocketNodeManager: artifacts.require('RocketNodeManager'),
    rocketNodeDeposit: artifacts.require('RocketNodeDeposit'),
    rocketDepositPool: artifacts.require('RocketDepositPool'),
    linkedListStorage: artifacts.require('LinkedListStorage'),

    rocketUpgradeOneDotFour: artifacts.require('RocketUpgradeOneDotFour'),
};

function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}

export async function deployUpgrade(rocketStorageAddress) {
    let contracts = {};
    let addresses = {};
    let upgradeContract;

    // Deploy other contracts
    for (let contract in networkContracts) {
        // Only deploy if it hasn't been deployed already like a precompiled
        let instance;
        const abi = networkContracts[contract].abi;

        switch (contract) {
            // Contracts with no constructor args
            case 'rocketMinipoolDelegate':
                instance = await networkContracts[contract].clone();
                addresses[contract] = instance.target;
                break;

            // Upgrade contract
            case 'rocketUpgradeOneDotFour':
                instance = await networkContracts[contract].new(rocketStorageAddress);
                const args = [
                    [
                        addresses.rocketMegapoolDelegate,
                        addresses.rocketMegapoolFactory,
                        addresses.rocketMegapoolProxy,
                        addresses.rocketNodeManager,
                        addresses.rocketNodeDeposit,
                        addresses.rocketDepositPool,
                        addresses.linkedListStorage,
                    ],
                    [
                        compressABI(networkContracts.rocketMegapoolDelegate.abi),
                        compressABI(networkContracts.rocketMegapoolFactory.abi),
                        compressABI(networkContracts.rocketMegapoolProxy.abi),
                        compressABI(networkContracts.rocketNodeManager.abi),
                        compressABI(networkContracts.rocketNodeDeposit.abi),
                        compressABI(networkContracts.rocketDepositPool.abi),
                        compressABI(networkContracts.linkedListStorage.abi),
                    ],
                ];
                await instance.set(...args);
                upgradeContract = instance;
                break;

            // All other contracts - pass storage address
            default:
                instance = await networkContracts[contract].clone(rocketStorageAddress);
                addresses[contract] = instance.target;
                break;
        }

        contracts[contract] = {
            instance: instance,
            address: instance.target,
            abi: abi,
        };
    }

    return upgradeContract;
}
