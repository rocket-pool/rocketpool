import { RocketClaimDAO, RocketTokenRPL } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const helpers = require('@nomicfoundation/hardhat-network-helpers');

export async function payOutContracts(_contractNames, txOptions) {
    // Load contracts
    const rocketClaimDAO = await RocketClaimDAO.deployed();

    // Calculate expected payouts
    let contracts = [];
    let expectedPayouts = {};
    for (const name of _contractNames) {
        contracts.push(await rocketClaimDAO.getContract(name));
    }

    const currentTime = await helpers.time.latest();

    for (const contract of contracts) {
        const lastPaymentTime = Number(contract.lastPaymentTime);
        const periodLength = Number(contract.periodLength);
        const numPeriods = Number(contract.numPeriods);
        const periodsPaid = Number(contract.periodsPaid);

        if (periodsPaid >= numPeriods) {
            continue;
        }

        let periodsToPay = Math.floor((currentTime - lastPaymentTime) / periodLength);
        if (periodsToPay + periodsPaid > numPeriods) {
            periodsToPay = numPeriods - periodsPaid;
        }
        const expectedPayout = contract.amountPerPeriod * BigInt(periodsToPay);

        if (!expectedPayouts.hasOwnProperty(contract.recipient)) {
            expectedPayouts[contract.recipient] = 0n;
        }
        expectedPayouts[contract.recipient] = expectedPayouts[contract.recipient] + expectedPayout;
    }

    async function getBalances() {
        let balances = {};
        for (const address in expectedPayouts) {
            balances[address] = await rocketClaimDAO.getBalance(address);
        }
        return balances;
    }

    // Record balances before, execute, record balances after
    const balancesBefore = await getBalances();
    await rocketClaimDAO.connect(txOptions.from).payOutContracts(_contractNames, txOptions);
    const balancesAfter = await getBalances();

    // Check balance deltas
    for (const address in expectedPayouts) {
        const delta = balancesAfter[address] - balancesBefore[address];
        assertBN.equal(delta, expectedPayouts[address], 'Unexpected change in balance');
    }
}

export async function withdrawBalance(recipient, txOptions) {
    // Load contracts
    const rocketClaimDAO = await RocketClaimDAO.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Get balance before withdrawal
    const balanceBefore = await rocketClaimDAO.getBalance(recipient);
    const tokenBalanceBefore = await rocketTokenRPL.balanceOf(recipient);

    // Withdraw
    await rocketClaimDAO.connect(txOptions.from).withdrawBalance(recipient, txOptions);

    // Check change in balances
    const balanceAfter = await rocketClaimDAO.getBalance(recipient);
    const tokenBalanceAfter = await rocketTokenRPL.balanceOf(recipient);

    assertBN.equal(balanceAfter, 0n, 'Balance did not zero');
    assertBN.equal(tokenBalanceAfter - tokenBalanceBefore, balanceBefore, 'Unexpected change in RPL balance');

    return balanceBefore;
}

