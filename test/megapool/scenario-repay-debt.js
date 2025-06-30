import { RocketTokenRETH } from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';

const hre = require('hardhat');
const ethers = hre.ethers;

export async function repayDebt(megapool, amount) {
    const rocketTokenRETH = await RocketTokenRETH.deployed()
    async function getData() {
        const [ debt, rethBalance ] = await Promise.all([
            megapool.getDebt(),
            ethers.provider.getBalance(rocketTokenRETH.target),
        ])
        return {debt, rethBalance};
    }

    const data1 = await getData()

    await megapool.repayDebt({ value: amount });

    const data2 = await getData()
    assertBN.equal(data2.debt, data1.debt - amount);

    const balanceDelta = data2.rethBalance - data1.rethBalance;
    assertBN.equal(balanceDelta, data1.debt)
}