import { RocketMinipoolManager, RocketDAOProtocolSettingsMinipool } from '../_utils/artifacts';
import { getValidatorSignature, getDepositDataRoot } from '../_utils/beacon';


// Stake a minipool
export async function stake(minipool, validatorPubkey, withdrawalCredentials, txOptions) {

    // Load contracts
    const [
        rocketMinipoolManager,
        rocketDAOProtocolSettingsMinipool,
    ] = await Promise.all([
        RocketMinipoolManager.deployed(),
        RocketDAOProtocolSettingsMinipool.deployed(),
    ]);

    // Get parameters
    let launchBalance = await rocketDAOProtocolSettingsMinipool.getLaunchBalance.call();

    // Get minipool withdrawal credentials
    if (!withdrawalCredentials) withdrawalCredentials = await minipool.getWithdrawalCredentials.call();

    // Get validator deposit data
    let depositData = {
        pubkey: validatorPubkey,
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(32000000000), // gwei
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
    assert(details2.balance.eq(details1.balance.sub(launchBalance)), 'Incorrect updated minipool ETH balance');

    // Check minipool by validator pubkey
    assert.equal(validatorMinipool1, '0x0000000000000000000000000000000000000000', 'Incorrect initial minipool by validator pubkey');
    assert.equal(validatorMinipool2, minipool.address, 'Incorrect updated minipool by validator pubkey');

}

