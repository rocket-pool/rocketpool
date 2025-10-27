import { artifacts } from '../_utils/artifacts';
import { RocketPoolDeployer } from './deployer';

const hre = require('hardhat');
const ethers = hre.ethers;

const revertOnTransfer = artifacts.require('RevertOnTransfer');

// Deploy Rocket Pool with mocks and helpers used in testing
export async function deployRocketPool() {
    const [signer] = await ethers.getSigners();
    const deployer = new RocketPoolDeployer(signer, { logging: false });

    deployer.contractPlan['beaconStateVerifier'] = {
        constructorArgs: () => deployer.defaultConstructorArgs(),
        artifact: artifacts.require('BeaconStateVerifierMock'),
    }

    // Add helper contracts to deployment
    deployer.contractPlan['linkedListStorageHelper'] = {
        constructorArgs: () => deployer.defaultConstructorArgs(),
        artifact: artifacts.require('LinkedListStorageHelper'),
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
