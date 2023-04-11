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

    const salt = minipoolSalt++;
    const minipoolAddress = await rocketMinipoolFactory.getExpectedAddress(txOptions.from, salt);
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
        rocketMinipoolManager.getMinipoolAt.call(minipoolCounts2.network.sub('1'.BN)),
        rocketMinipoolManager.getNodeMinipoolAt.call(txOptions.from, minipoolCounts2.node.sub('1'.BN)),
        getMinipoolDetails(minipoolAddress),
    ]);

    // Check minipool indexes
    assertBN.equal(minipoolCounts2.network, minipoolCounts1.network.add('1'.BN), 'Incorrect updated network minipool count');
    assert.strictEqual(lastMinipoolAddress.toLowerCase(), minipoolAddress.toLowerCase(), 'Incorrect updated network minipool index');
    assertBN.equal(minipoolCounts2.node, minipoolCounts1.node.add('1'.BN), 'Incorrect updated node minipool count');
    assert.strictEqual(lastNodeMinipoolAddress.toLowerCase(), minipoolAddress.toLowerCase(), 'Incorrect updated node minipool index');

    // Check minipool details
    assert.isTrue(minipoolDetails.exists, 'Incorrect created minipool exists status');
    assert.strictEqual(minipoolDetails.nodeAddress, txOptions.from, 'Incorrect created minipool node address');
    assertBN.equal(minipoolDetails.nodeDepositBalance, web3.utils.toBN(txOptions.value), 'Incorrect created minipool node deposit balance');
}
