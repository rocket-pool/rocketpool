import { GoGoTokenGGPAVAX, RocketTokenNETH, RocketTokenDummyGGP, GoGoTokenGGP } from '../_utils/artifacts';


// Get the RPL balance of an address
export async function getRplBalance(address) {
    const gogoTokenGGP = await GoGoTokenGGP.deployed();
    let balance = gogoTokenGGP.balanceOf.call(address);
    return balance;
}


// Get the rETH balance of an address
export async function getRethBalance(address) {
    const gogoTokenGGPAVAX = await GoGoTokenGGPAVAX.deployed();
    let balance = gogoTokenGGPAVAX.balanceOf.call(address);
    return balance;
}


// Get the current rETH exchange rate
export async function getRethExchangeRate() {
    const gogoTokenGGPAVAX = await GoGoTokenGGPAVAX.deployed();
    let exchangeRate = await gogoTokenGGPAVAX.getExchangeRate.call();
    return exchangeRate;
}


// Get the current rETH collateral rate
export async function getRethCollateralRate() {
    const gogoTokenGGPAVAX = await GoGoTokenGGPAVAX.deployed();
    let collateralRate = await gogoTokenGGPAVAX.getCollateralRate.call();
    return collateralRate;
}


// Get the current rETH token supply
export async function getRethTotalSupply() {
    const gogoTokenGGPAVAX = await GoGoTokenGGPAVAX.deployed();
    let totalSupply = await gogoTokenGGPAVAX.totalSupply.call();
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
    const [rocketTokenDummyRPL, gogoTokenGGP] = await Promise.all([
        RocketTokenDummyGGP.deployed(),
        GoGoTokenGGP.deployed(),
    ]);

    // Mint dummy RPL to address
    await rocketTokenDummyRPL.mint(toAddress, amount, {from: owner});

    // Swap dummy RPL for RPL
    await rocketTokenDummyRPL.approve(gogoTokenGGP.address, amount, {from: toAddress});
    await gogoTokenGGP.swapTokens(amount, {from: toAddress});

}


// Approve RPL to be spend by an address
export async function approveRPL(spender, amount, txOptions) {
    const gogoTokenGGP = await GoGoTokenGGP.deployed();
    await gogoTokenGGP.approve(spender, amount, txOptions);
}


export async function depositExcessCollateral(txOptions) {
    const gogoTokenGGPAVAX = await GoGoTokenGGPAVAX.deployed();
    await gogoTokenGGPAVAX.depositExcessCollateral(txOptions);
}
