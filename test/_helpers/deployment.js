/*** Dependencies ********************/
import { artifacts } from '../_utils/artifacts';
import { RocketPoolDeployer } from './deployer';

const hre = require('hardhat');
const ethers = hre.ethers;

// Development helper contracts
const revertOnTransfer = artifacts.require('RevertOnTransfer');
const rocketNodeDepositLEB4 = artifacts.require('RocketNodeDepositLEB4');

// Deploy Rocket Pool
export async function deployRocketPool() {
    const [signer] = await ethers.getSigners();
    const deployer = new RocketPoolDeployer(signer, { logging: false });
    await deployer.deploy();

    let instance = await revertOnTransfer.new();
    revertOnTransfer.setAsDeployed(instance);

    instance = await rocketNodeDepositLEB4.new(deployer.rocketStorageInstance.target);
    rocketNodeDepositLEB4.setAsDeployed(instance);
}
