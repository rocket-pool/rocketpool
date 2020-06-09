import { RocketETHToken } from '../_utils/artifacts';


// Get the current rETH exchange rate
export async function getRethExchangeRate() {
    const rocketETHToken = await RocketETHToken.deployed();
    let exchangeRate = await rocketETHToken.getExchangeRate.call();
    return exchangeRate;
}

