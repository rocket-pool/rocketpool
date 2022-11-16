import {
    RocketMinipoolDelegate, RocketMinipoolFactory,
    RocketMinipoolManager,
    RocketNodeDeposit,
    RocketStorage,
} from '../_utils/artifacts';
import { getDepositDataRoot, getValidatorPubkey, getValidatorSignature } from '../_utils/beacon';
import { assertBN } from '../_helpers/bn';

let minipoolSalt = 0;

// Make a node deposit
export async function deposit(minimumNodeFee, txOptions) {

    // Load contracts
    const [
        rocketMinipoolManager,
        rocketMinipoolFactory,
        rocketNodeDeposit,
        rocketStorage,
    ] = await Promise.all([
        RocketMinipoolManager.deployed(),
        RocketMinipoolFactory.deployed(),
        RocketNodeDeposit.deployed(),
        RocketStorage.deployed()
    ]);

    // Get minipool counts
    function getMinipoolCounts(nodeAddress) {
        return Promise.all([
            rocketMinipoolManager.getMinipoolCount.call(),
            rocketMinipoolManager.getNodeMinipoolCount.call(nodeAddress),
        ]).then(
            ([network, node]) =>
            ({network, node})
        );
    }

    // Get minipool details
    function getMinipoolDetails(minipoolAddress) {
        return RocketMinipoolDelegate.at(minipoolAddress).then(minipool => Promise.all([
            rocketMinipoolManager.getMinipoolExists.call(minipoolAddress),
            minipool.getNodeAddress.call(),
            minipool.getNodeDepositBalance.call(),
            minipool.getNodeDepositAssigned.call(),
        ])).then(
            ([exists, nodeAddress, nodeDepositBalance, nodeDepositAssigned]) =>
            ({exists, nodeAddress, nodeDepositBalance, nodeDepositAssigned})
        );
    }

    // Get initial minipool indexes
    let minipoolCounts1 = await getMinipoolCounts(txOptions.from);

    // Deposit

    // Get artifact and bytecode
    const RocketMinipool = artifacts.require('RocketMinipoolOld');
    const contractBytecode = RocketMinipool.bytecode;

    // Construct creation code for minipool deploy
    const constructorArgs = web3.eth.abi.encodeParameters(['address', 'address'], [rocketStorage.address, txOptions.from]);
    const deployCode = contractBytecode + constructorArgs.substr(2);
    const salt = minipoolSalt++;

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

    const minipoolAddress = '0x' + raw.substr(raw.length - 40);
    let withdrawalCredentials = '0x010000000000000000000000' + minipoolAddress.substr(2);

    // Get validator deposit data
    let depositData = {
        pubkey: getValidatorPubkey(),
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(1000000000), // 1 ETH in gwei
        signature: getValidatorSignature(),
    };

    let depositDataRoot = getDepositDataRoot(depositData);

    // Make node deposit
    await rocketNodeDeposit.deposit(txOptions.value, minimumNodeFee, depositData.pubkey, depositData.signature, depositDataRoot, salt, minipoolAddress, txOptions);

    // Get updated minipool indexes & created minipool details
    let minipoolCounts2 = await getMinipoolCounts(txOptions.from);
    let [
        lastMinipoolAddress,
        lastNodeMinipoolAddress,
        minipoolDetails,
    ] = await Promise.all([
        rocketMinipoolManager.getMinipoolAt.call(minipoolCounts2.network.sub(web3.utils.toBN(1))),
        rocketMinipoolManager.getNodeMinipoolAt.call(txOptions.from, minipoolCounts2.node.sub(web3.utils.toBN(1))),
        getMinipoolDetails(minipoolAddress),
    ]);

    // Check minipool indexes
    assertBN.equal(minipoolCounts2.network, minipoolCounts1.network.add(web3.utils.toBN(1)), 'Incorrect updated network minipool count');
    assert.strictEqual(lastMinipoolAddress.toLowerCase(), minipoolAddress.toLowerCase(), 'Incorrect updated network minipool index');
    assertBN.equal(minipoolCounts2.node, minipoolCounts1.node.add(web3.utils.toBN(1)), 'Incorrect updated node minipool count');
    assert.strictEqual(lastNodeMinipoolAddress.toLowerCase(), minipoolAddress.toLowerCase(), 'Incorrect updated node minipool index');

    // Check minipool details
    assert.isTrue(minipoolDetails.exists, 'Incorrect created minipool exists status');
    assert.strictEqual(minipoolDetails.nodeAddress, txOptions.from, 'Incorrect created minipool node address');
    assertBN.equal(minipoolDetails.nodeDepositBalance, web3.utils.toBN(txOptions.value), 'Incorrect created minipool node deposit balance');
}
