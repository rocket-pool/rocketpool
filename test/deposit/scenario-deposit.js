import {
    RocketDAOProtocolSettingsDeposit,
    RocketDepositPool,
    RocketTokenRETH,
    RocketVault,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

// Make a deposit into the deposit pool
export async function deposit(txOptions) {
    // Load contracts
    const [
        rocketDAOProtocolSettingsDeposit,
        rocketDepositPool,
        rocketTokenRETH,
        rocketVault,
    ] = await Promise.all([
        RocketDAOProtocolSettingsDeposit.deployed(),
        RocketDepositPool.deployed(),
        RocketTokenRETH.deployed(),
        RocketVault.deployed(),
    ]);

    // Get parameters
    let depositFeePerc = await rocketDAOProtocolSettingsDeposit.getDepositFee();

    // Get balances
    function getBalances() {
        return Promise.all([
            rocketDepositPool.getBalance(),
            rocketDepositPool.getNodeBalance(),
            ethers.provider.getBalance(rocketVault.target),
            rocketTokenRETH.balanceOf(txOptions.from),
        ]).then(
            ([depositPoolEth, depositPoolNodeEth, vaultEth, userReth]) =>
            ({depositPoolEth, depositPoolNodeEth, vaultEth, userReth})
        );
    }

    // Get initial balances
    let balances1 = await getBalances();

    // Deposit
    await rocketDepositPool.connect(txOptions.from).deposit(txOptions);

    // Get updated balances
    let balances2 = await getBalances();

    // Calculate values
    let txValue = BigInt(txOptions.value);
    let calcBase = '1'.ether;
    let depositFee = txValue * depositFeePerc / calcBase;
    let expectedRethMinted = await rocketTokenRETH.getRethValue(txValue - depositFee);

    // Check balances
    assertBN.equal(balances2.depositPoolEth, balances1.depositPoolEth + txValue, 'Incorrect updated deposit pool ETH balance');
    assertBN.equal(balances2.vaultEth, balances1.vaultEth + txValue, 'Incorrect updated vault ETH balance');
    assertBN.equal(balances2.userReth, balances1.userReth + expectedRethMinted, 'Incorrect updated user rETH balance');
}
