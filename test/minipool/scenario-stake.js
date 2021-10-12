import { RocketMinipoolManager, RocketDAOProtocolSettingsMinipool } from '../_utils/artifacts';
import { getValidatorSignature, getDepositDataRoot, getValidatorPubkey } from '../_utils/beacon';


// Stake a minipool
export async function stake(minipool, withdrawalCredentials, txOptions, validatorPubkey = null) {

    // Load contracts
    const [
        rocketMinipoolManager,
        rocketDAOProtocolSettingsMinipool,
    ] = await Promise.all([
        RocketMinipoolManager.deployed(),
        RocketDAOProtocolSettingsMinipool.deployed(),
    ]);

    // Get minipool validator pubkey
    if (!validatorPubkey) validatorPubkey = await rocketMinipoolManager.getMinipoolPubkey(minipool.address);

    // Get minipool withdrawal credentials
    if (!withdrawalCredentials) withdrawalCredentials = await rocketMinipoolManager.getMinipoolWithdrawalCredentials.call(minipool.address);

    // Get validator deposit data
    let depositData = {
        pubkey: Buffer.from(validatorPubkey.substr(2), 'hex'),
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(16000000000), // gwei
        signature: getValidatorSignature(),
    };
    let depositDataRoot = getDepositDataRoot(depositData);

    // Get minipool details
    function getMinipoolDetails() {
        return Promise.all([
            minipool.getStatus.call(),
            web3.eth.getBalance(minipool.address).then(value => web3.utils.toBN(value)),
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
    await minipool.stake(depositData.pubkey, depositData.signature, depositDataRoot, txOptions);

    // Get updated minipool details & minipool by validator pubkey
    let [details2, validatorMinipool2] = await Promise.all([
        getMinipoolDetails(),
        rocketMinipoolManager.getMinipoolByPubkey.call(validatorPubkey),
    ]);

    // Check minpool details
    const staking = web3.utils.toBN(2);
    assert(!details1.status.eq(staking), 'Incorrect initial minipool status');
    assert(details2.status.eq(staking), 'Incorrect updated minipool status');
    assert(details2.balance.eq(details1.balance.sub(web3.utils.toBN(web3.utils.toWei('16', 'ether')))), 'Incorrect updated minipool ETH balance');

    // Check minipool by validator pubkey
    assert.equal(validatorMinipool2, minipool.address, 'Incorrect updated minipool by validator pubkey');

}

