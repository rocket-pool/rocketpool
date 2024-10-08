import { RocketTokenDummyRPL, RocketTokenRETH, RocketTokenRPL } from '../_utils/artifacts';

// Get the RPL balance of an address
export async function getRplBalance(address) {
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    return rocketTokenRPL.balanceOf(address);
}

// Get the rETH balance of an address
export async function getRethBalance(address) {
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    return rocketTokenRETH.balanceOf(address);
}

// Get the current rETH exchange rate
export async function getRethExchangeRate() {
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    return rocketTokenRETH.getExchangeRate();
}

// Get the current rETH collateral rate
export async function getRethCollateralRate() {
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    return rocketTokenRETH.getCollateralRate();
}

// Get the current rETH token supply
export async function getRethTotalSupply() {
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    return rocketTokenRETH.totalSupply();
}

// Mint RPL to an address
export async function mintRPL(owner, toAddress, amount) {
    // Load contracts
    const [rocketTokenDummyRPL, rocketTokenRPL] = await Promise.all([
        RocketTokenDummyRPL.deployed(),
        RocketTokenRPL.deployed(),
    ]);

    // Mint dummy RPL to address
    await rocketTokenDummyRPL.connect(owner).mint(toAddress, amount);

    // Swap dummy RPL for RPL
    await rocketTokenDummyRPL.connect(toAddress).approve(rocketTokenRPL.target, amount);
    await rocketTokenRPL.connect(toAddress).swapTokens(amount);
}

// Approve RPL to be spend by an address
export async function approveRPL(spender, amount, txOptions) {
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    await rocketTokenRPL.connect(txOptions.from).approve(spender, amount, txOptions);
}

export async function depositExcessCollateral(txOptions) {
    const rocketTokenRETH = await RocketTokenRETH.deployed();
    await rocketTokenRETH.connect(txOptions.from).depositExcessCollateral(txOptions);
}
