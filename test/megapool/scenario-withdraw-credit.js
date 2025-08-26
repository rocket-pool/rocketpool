import {
    RocketDAOProtocolSettingsDeposit,
    RocketDepositPool,
    RocketStorage,
    RocketTokenRETH,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

export async function withdrawCredit(node, amount) {
    const rocketDepositPool = await RocketDepositPool.deployed();
    const rocketStorage = await RocketStorage.deployed();
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    const rocketDAOProtocolSettingsDeposit = await RocketDAOProtocolSettingsDeposit.deployed();

    const depositFeePerc = await rocketDAOProtocolSettingsDeposit.getDepositFee();

    async function getData() {
        const [
            rethBalance,
            creditBalance,
            userBalance,
        ] = await Promise.all([
            rocketTokenRETH.balanceOf(withdrawalAddress),
            rocketDepositPool.getNodeCreditBalance(node.address),
            rocketDepositPool.getUserBalance()
        ]);

        return {rethBalance, creditBalance, userBalance};
    }

    const calcBase = '1'.ether;
    const depositFee = amount * depositFeePerc / calcBase;
    const amountAfterFee = amount - depositFee

    const withdrawalAddress = await rocketStorage.getNodeWithdrawalAddress(node.address);
    const rethValue = await rocketTokenRETH.getRethValue(amountAfterFee);

    const dataBefore = await getData();

    await rocketDepositPool.connect(node).withdrawCredit(amount);

    const dataAfter = await getData();


    const rethBalanceDelta = dataAfter.rethBalance - dataBefore.rethBalance;
    const creditBalanceDelta = dataAfter.creditBalance - dataBefore.creditBalance;
    const userBalanceDelta = dataAfter.userBalance - dataBefore.userBalance;

    assertBN.equal(rethBalanceDelta, rethValue);
    assertBN.equal(creditBalanceDelta, -amount);
    assertBN.equal(userBalanceDelta, 0n);
}