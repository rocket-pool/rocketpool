import { artifacts } from '../_utils/artifacts';
import { RocketPoolDeployer } from './deployer';

const { ethers } = require('#hardhat-runtime');

const revertOnTransfer = artifacts.require('RevertOnTransfer');

// Deploy Rocket Pool with mocks and helpers used in testing
export async function deployRocketPool() {
    const [signer] = await ethers.getSigners();
    const deployer = new RocketPoolDeployer(signer, { logging: false });

    deployer.contractPlan['beaconStateVerifier'] = {
        constructorArgs: () => [...deployer.defaultConstructorArgs(), [74240n * 32n, 144896n * 32n, 194048n * 32n, 269568n * 32n, 364032n * 32n, 411392n * 32n, 14000000n]],
        artifact: artifacts.require('BeaconStateVerifierMock'),
    }

    // Add helper contracts to deployment
    deployer.contractPlan['storageHelper'] = {
        constructorArgs: () => deployer.defaultConstructorArgs(),
        artifact: artifacts.require('StorageHelper'),
    };

    deployer.contractPlan['megapoolUpgradeHelper'] = {
        constructorArgs: () => deployer.defaultConstructorArgs(),
        artifact: artifacts.require('MegapoolUpgradeHelper'),
    };

    deployer.contractPlan['stakeHelper'] = {
        constructorArgs: () => deployer.defaultConstructorArgs(),
        artifact: artifacts.require('StakeHelper'),
    };

    await deployer.deploy();

    // Deploy other utilities used in tests that aren't network contracts
    let revertOnTransferInstance = await revertOnTransfer.new();
    revertOnTransfer.setAsDeployed(revertOnTransferInstance);
}
