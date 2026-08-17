import {
    RocketMinipoolDelegate, RocketMinipoolFactory,
    RocketMinipoolManager,
    RocketNodeDeposit,
} from '../_utils/artifacts';
import { getDepositDataRoot, getValidatorPubkey, getValidatorSignature } from '../_utils/beacon';
import { assertBN } from '../_helpers/bn';
import * as assert from 'assert';

let minipoolSalt = 0;

// Make a node deposit
export async function depositV2(minimumNodeFee, bondAmount, txOptions) {
    // Load contracts
    const [
        rocketMinipoolManager,
        rocketMinipoolFactory,
        rocketNodeDeposit,
    ] = await Promise.all([
        RocketMinipoolManager.deployed(),
        RocketMinipoolFactory.deployed(),
        RocketNodeDeposit.deployed(),
    ]);

    // Get minipool counts
    function getMinipoolCounts(nodeAddress) {
        return Promise.all([
            rocketMinipoolManager.getMinipoolCount(),
            rocketMinipoolManager.getNodeMinipoolCount(nodeAddress),
        ]).then(
            ([network, node]) =>
            ({network, node})
        );
    }

    // Get minipool details
    function getMinipoolDetails(minipoolAddress) {
        const minipool = RocketMinipoolDelegate.at(minipoolAddress);
        return Promise.all([
            rocketMinipoolManager.getMinipoolExists(minipoolAddress),
            minipool.getNodeAddress(),
            minipool.getNodeDepositBalance(),
            minipool.getNodeDepositAssigned(),
        ]).then(
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
    if (bondAmount === txOptions.value) {
        await rocketNodeDeposit.connect(txOptions.from).deposit(bondAmount, minimumNodeFee, depositData.pubkey, depositData.signature, depositDataRoot, salt, minipoolAddress, txOptions);
    } else {
        await rocketNodeDeposit.connect(txOptions.from).depositWithCredit(bondAmount, minimumNodeFee, depositData.pubkey, depositData.signature, depositDataRoot, salt, minipoolAddress, txOptions);
    }

    // Get updated minipool indexes & created minipool details
    let minipoolCounts2 = await getMinipoolCounts(txOptions.from);
    let [
        lastMinipoolAddress,
        lastNodeMinipoolAddress,
        minipoolDetails,
    ] = await Promise.all([
        rocketMinipoolManager.getMinipoolAt(minipoolCounts2.network - 1n),
        rocketMinipoolManager.getNodeMinipoolAt(txOptions.from, minipoolCounts2.node - 1n),
        getMinipoolDetails(minipoolAddress),
    ]);

    // Check minipool indexes
    assertBN.equal(minipoolCounts2.network, minipoolCounts1.network + 1n, 'Incorrect updated network minipool count');
    assert.strictEqual(lastMinipoolAddress.toLowerCase(), minipoolAddress.toLowerCase(), 'Incorrect updated network minipool index');
    assertBN.equal(minipoolCounts2.node, minipoolCounts1.node + 1n, 'Incorrect updated node minipool count');
    assert.strictEqual(lastNodeMinipoolAddress.toLowerCase(), minipoolAddress.toLowerCase(), 'Incorrect updated node minipool index');

    // Check minipool details
    assert.equal(minipoolDetails.exists, true, 'Incorrect created minipool exists status');
    assert.strictEqual(minipoolDetails.nodeAddress.toLowerCase(), txOptions.from.address.toLowerCase(), 'Incorrect created minipool node address');
    assertBN.equal(minipoolDetails.nodeDepositBalance, bondAmount, 'Incorrect created minipool node deposit balance');

    return minipoolAddress
}
