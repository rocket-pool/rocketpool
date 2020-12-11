import { RocketTokenRETH, RocketTokenNETH, RocketTokenDummyRPL, RocketTokenRPL } from '../_utils/artifacts';


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


// Mint RPL to an address
export async function mintRPL(owner, toAddress, amount) {

    // Load contracts
    const [rocketTokenDummyRPL, rocketTokenRPL] = await Promise.all([
        RocketTokenDummyRPL.deployed(),
        RocketTokenRPL.deployed(),
    ]);

    // Mint dummy RPL to address
    await rocketTokenDummyRPL.mint(toAddress, amount, {from: owner});

    // Swap dummy RPL for RPL
    await rocketTokenDummyRPL.approve(rocketTokenRPL.address, amount, {from: toAddress});
    await rocketTokenRPL.swapTokens(amount, {from: toAddress});

}

