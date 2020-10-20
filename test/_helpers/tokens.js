import { RocketTokenRETH, RocketTokenNETH } from '../_utils/artifacts';


// Get the rETH balance of an address
export async function getRethBalance(address) {
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    let balance = rocketTokenRETH.balanceOf.call(address);
    return balance;
}


// Get the current rETH exchange rate
export async function getRethExchangeRate() {
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    let exchangeRate = await rocketTokenRETH.getExchangeRate.call();
    return exchangeRate;
}


// Get the current rETH collateral rate
export async function getRethCollateralRate() {
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    let collateralRate = await rocketTokenRETH.getCollateralRate.call();
    return collateralRate;
}


// Get the current rETH token supply
export async function getRethTotalSupply() {
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    let totalSupply = await rocketTokenRETH.totalSupply.call();
    return totalSupply;
}


// Get the nETH balance of an address
export async function getNethBalance(address) {
    const rocketTokenNETH = await RocketTokenNETH.deployed();
    let balance = rocketTokenNETH.balanceOf.call(address);
    return balance;
}

