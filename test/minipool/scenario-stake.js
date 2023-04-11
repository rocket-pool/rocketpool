import { RocketMinipoolManager, RocketDAOProtocolSettingsMinipool } from '../_utils/artifacts';
import { getValidatorSignature, getDepositDataRoot, getValidatorPubkey } from '../_utils/beacon';
import { assertBN } from '../_helpers/bn';
import { minipoolStates } from '../_helpers/minipool';


// Stake a minipool
export async function stake(minipool, withdrawalCredentials, txOptions, validatorPubkey = null) {
    // Load contracts
    const [
        rocketMinipoolManager,
    ] = await Promise.all([
        RocketMinipoolManager.deployed(),
    ]);

    // Get minipool validator pubkey
    if (!validatorPubkey) validatorPubkey = await rocketMinipoolManager.getMinipoolPubkey(minipool.address);

    // Get minipool withdrawal credentials
    if (!withdrawalCredentials) withdrawalCredentials = await rocketMinipoolManager.getMinipoolWithdrawalCredentials.call(minipool.address);

    // Get validator deposit data
    let depositData = {
        pubkey: Buffer.from(validatorPubkey.substr(2), 'hex'),
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(31000000000), // 31 ETH in gwei
        signature: getValidatorSignature(),
    };
    let depositDataRoot = getDepositDataRoot(depositData);

    // Get minipool details
    function getMinipoolDetails() {
        return Promise.all([
            minipool.getStatus.call(),
            web3.eth.getBalance(minipool.address).then(value => value.BN),
        ]).then(
            ([status, balance]) =>
            ({status, balance})
        );
    }

    // Get initial minipool details & minipool by validator pubkey
    let [details1, validatorMinipool1] = await Promise.all([
        getMinipoolDetails(),
        rocketMinipoolManager.getMinipoolByPubkey.call(validatorPubkey),
    ]);

    // Stake
    await minipool.stake(depositData.signature, depositDataRoot, txOptions);

    // Get updated minipool details & minipool by validator pubkey
    let [details2, validatorMinipool2] = await Promise.all([
        getMinipoolDetails(),
        rocketMinipoolManager.getMinipoolByPubkey.call(validatorPubkey),
    ]);

    // Check minpool details
    assertBN.notEqual(details1.status, minipoolStates.Staking, 'Incorrect initial minipool status');
    assertBN.equal(details2.status, minipoolStates.Staking, 'Incorrect updated minipool status');
    assertBN.equal(details2.balance, details1.balance.sub('31'.ether), 'Incorrect updated minipool ETH balance');

    // Check minipool by validator pubkey
    assert.strictEqual(validatorMinipool2, minipool.address, 'Incorrect updated minipool by validator pubkey');
}
