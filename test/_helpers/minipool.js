import {
    RocketMinipoolDelegate,
    RocketMinipoolManager,
    RocketMinipoolFactory,
    RocketDAOProtocolSettingsMinipool,
    RocketMinipoolStatus,
    RocketNetworkPrices,
    RocketNodeDeposit,
    RocketDAOProtocolSettingsNode,
    RocketStorage, RocketNodeDepositOld, RocketMinipoolFactoryOld, RocketMinipoolManagerOld,
} from '../_utils/artifacts';
import { getValidatorPubkey, getValidatorSignature, getDepositDataRoot } from '../_utils/beacon';
import { upgradeExecuted } from '../_utils/upgrade';
import { withdraw } from '../minipool/scenario-withdraw';


// Get the number of minipools a node has
export async function getNodeMinipoolCount(nodeAddress) {
    const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    let count = await rocketMinipoolManager.getNodeMinipoolCount.call(nodeAddress);
    return count;
}

// Get the number of minipools a node has in Staking status
export async function getNodeStakingMinipoolCount(nodeAddress) {
  const rocketMinipoolManager = await RocketMinipoolManager.deployed();
  let count = await rocketMinipoolManager.getNodeStakingMinipoolCount.call(nodeAddress);
  return count;
}

// Get the number of minipools a node has in that are active
export async function getNodeActiveMinipoolCount(nodeAddress) {
    const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    let count = await rocketMinipoolManager.getNodeActiveMinipoolCount.call(nodeAddress);
    return count;
}

// Get the minimum required RPL stake for a minipool
export async function getMinipoolMinimumRPLStake() {

    // Load contracts
    const [
        rocketDAOProtocolSettingsMinipool,
        rocketNetworkPrices,
        rocketDAOProtocolSettingsNode,
    ] = await Promise.all([
        RocketDAOProtocolSettingsMinipool.deployed(),
        RocketNetworkPrices.deployed(),
        RocketDAOProtocolSettingsNode.deployed(),
    ]);

    // Load data
    let [depositUserAmount, minMinipoolStake, rplPrice] = await Promise.all([
        rocketDAOProtocolSettingsMinipool.getHalfDepositUserAmount(),
        rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake(),
        rocketNetworkPrices.getRPLPrice(),
    ]);

    // Calculate & return
    return depositUserAmount.mul(minMinipoolStake).div(rplPrice);

}

let minipoolSalt = 1

// Create a minipool
export async function createMinipool(txOptions, salt = null) {
    const preUpdate = !(await upgradeExecuted());

    // Load contracts
    const [
        rocketMinipoolFactory,
        rocketNodeDeposit,
        rocketStorage,
    ] = await Promise.all([
        preUpdate ? RocketMinipoolFactoryOld.deployed() : RocketMinipoolFactory.deployed(),
        preUpdate ? RocketNodeDepositOld.deployed() : RocketNodeDeposit.deployed(),
        RocketStorage.deployed()
    ]);

    // Get minipool contract bytecode
    let contractBytecode;

    if (preUpdate) {
        const RocketMinipool = artifacts.require('RocketMinipoolOld');
        contractBytecode = RocketMinipool.bytecode;
    } else {
        const RocketMinipoolProxy = artifacts.require('RocketMinipoolProxy');
        contractBytecode = RocketMinipoolProxy.bytecode;
    }

    // Construct creation code for minipool deploy
    let constructorArgs
    if (preUpdate) {
        const depositType = await rocketNodeDeposit.getDepositType(txOptions.value);
        constructorArgs = web3.eth.abi.encodeParameters(['address', 'address', 'uint8'], [rocketStorage.address, txOptions.from, depositType]);
    } else {
        constructorArgs = web3.eth.abi.encodeParameters(['address', 'address'], [rocketStorage.address, txOptions.from]);
    }
    const deployCode = contractBytecode + constructorArgs.substr(2);

    if (salt === null){
        salt = minipoolSalt++;
    }

    // Calculate keccak(nodeAddress, salt)
    const nodeSalt = web3.utils.soliditySha3(
      {type: 'address', value: txOptions.from},
      {type: 'uint256', value: salt}
    )

    // Calculate hash of deploy code
    const bytecodeHash = web3.utils.soliditySha3(
      {type: 'bytes', value: deployCode}
    )

    // Construct deterministic minipool address
    const raw = web3.utils.soliditySha3(
      {type: 'bytes1', value: '0xff'},
      {type: 'address', value: rocketMinipoolFactory.address},
      {type: 'bytes32', value: nodeSalt},
      {type: 'bytes32', value: bytecodeHash}
    )

    const minipoolAddress = raw.substr(raw.length - 40);
    let withdrawalCredentials = '0x010000000000000000000000' + minipoolAddress;

    // Make node deposit
    if (preUpdate){
        // Get validator deposit data
        let depositData = {
            pubkey: getValidatorPubkey(),
            withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
            amount: BigInt(16000000000), // gwei
            signature: getValidatorSignature(),
        };

        let depositDataRoot = getDepositDataRoot(depositData);

        await rocketNodeDeposit.deposit(web3.utils.toWei('0', 'ether'), depositData.pubkey, depositData.signature, depositDataRoot, salt, '0x' + minipoolAddress, txOptions);
    } else {
        // Get validator deposit data
        let depositData = {
            pubkey: getValidatorPubkey(),
            withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
            amount: BigInt(1000000000), // gwei
            signature: getValidatorSignature(),
        };

        let depositDataRoot = getDepositDataRoot(depositData);

        await rocketNodeDeposit.deposit(txOptions.value, web3.utils.toWei('0', 'ether'), depositData.pubkey, depositData.signature, depositDataRoot, salt, '0x' + minipoolAddress, txOptions);
    }

    return RocketMinipoolDelegate.at('0x' + minipoolAddress);
}


// Refund node ETH from a minipool
export async function refundMinipoolNodeETH(minipool, txOptions) {
    await minipool.refund(txOptions);
}


// Progress a minipool to staking
export async function stakeMinipool(minipool, txOptions) {

    const preUpdate = !(await upgradeExecuted());

    // Get contracts
    const rocketMinipoolManager = preUpdate ? await RocketMinipoolManagerOld.deployed() : await RocketMinipoolManager.deployed()

    // Get minipool validator pubkey
    const validatorPubkey = await rocketMinipoolManager.getMinipoolPubkey(minipool.address);

    // Get minipool withdrawal credentials
    let withdrawalCredentials = await rocketMinipoolManager.getMinipoolWithdrawalCredentials.call(minipool.address);

    // Get validator deposit data
    let depositData;

    if (preUpdate) {
        depositData = {
            pubkey: Buffer.from(validatorPubkey.substr(2), 'hex'),
            withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
            amount: BigInt(16000000000), // gwei
            signature: getValidatorSignature(),
        };
    } else {
        depositData = {
            pubkey: Buffer.from(validatorPubkey.substr(2), 'hex'),
            withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
            amount: BigInt(31000000000), // gwei
            signature: getValidatorSignature(),
        };
    }
    let depositDataRoot = getDepositDataRoot(depositData);

    // Stake
    await minipool.stake(depositData.signature, depositDataRoot, txOptions);

}


// Submit a minipool withdrawable event
export async function submitMinipoolWithdrawable(minipoolAddress, txOptions) {
    const rocketMinipoolStatus = await RocketMinipoolStatus.deployed();
    await rocketMinipoolStatus.submitMinipoolWithdrawable(minipoolAddress, txOptions);
}


// Dissolve a minipool
export async function dissolveMinipool(minipool, txOptions) {
    await minipool.dissolve(txOptions);
}


// Close a dissolved minipool and destroy it
export async function closeMinipool(minipool, txOptions) {
    await minipool.close(txOptions);
}

