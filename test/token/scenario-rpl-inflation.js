import { getCurrentTime, increaseTime, mineBlocks } from '../_utils/evm'
import { GoGoTokenGGP, RocketVault, RocketRewardsPool } from '../_utils/artifacts';
import { setRPLInflationIntervalRate, setRPLInflationStartTime } from '../dao/scenario-dao-protocol-bootstrap'

// Set inflation config
export async function rplSetInflationConfig(config, txOptions) {
    // Set the daily inflation start block
    await setRPLInflationStartTime(config.timeStart, txOptions);
    // Set the daily inflation rate
    await setRPLInflationIntervalRate(config.yearlyInflationTarget, txOptions);
}

// Get the current inflation period in blocks
export async function rplInflationIntervalBlocksGet(txOptions) {
    // Load contracts
    const gogoTokenGGP = await GoGoTokenGGP.deployed();
    return await gogoTokenGGP.getInflationIntervalBlocks.call();
};


// Claim the inflation after a set amount of blocks have passed
export async function rplClaimInflation(config, txOptions, tokenAmountToMatch = null) {
    // Convert param to BN
    if (tokenAmountToMatch) {
        tokenAmountToMatch = web3.utils.toBN(tokenAmountToMatch);
    }

    // Load contracts
    const gogoTokenGGP = await GoGoTokenGGP.deployed();
    const rocketVault = await RocketVault.deployed();

    // Get the previously last inflation calculated block
    const timeIntervalLastCalc = web3.utils.toBN(await gogoTokenGGP.getInflationCalcTime.call());

    // Get data about the current inflation
    function getInflationData() {
        return Promise.all([
            getCurrentTime(web3),
            gogoTokenGGP.totalSupply.call(),
            gogoTokenGGP.getInflationIntervalStartTime.call(),
            gogoTokenGGP.getInflationIntervalsPassed.call(),
            gogoTokenGGP.getInflationCalcTime.call(),
            gogoTokenGGP.getInflationIntervalTime.call(),
            gogoTokenGGP.balanceOf(rocketVault.address),
            rocketVault.balanceOfToken('rocketRewardsPool', gogoTokenGGP.address),
        ]).then(
            ([currentTime, tokenTotalSupply, inflationStartTime, inflationIntervalsPassed, inflationCalcTime, intervalTime, rocketVaultBalanceRPL, rocketVaultInternalBalanceRPL]) =>
            ({currentTime, tokenTotalSupply, inflationStartTime, inflationIntervalsPassed, inflationCalcTime, intervalTime, rocketVaultBalanceRPL, rocketVaultInternalBalanceRPL})
        );
    }

    // Get the current time so we can calculate how much time to pass to make it to the claim time
    let currentTime = await getCurrentTime(web3);

    // Blocks to process as passing
    let timeToSimulatePassing = config.timeClaim - currentTime;
    // Simulate time passing
    await increaseTime(web3, timeToSimulatePassing);

    // Get initial data
    let inflationData1 = await getInflationData();
    //console.log(inflationData1.currentBlock, web3.utils.fromWei(inflationData1.tokenTotalSupply), inflationData1.inflationStartBlock.toString(), web3.utils.fromWei(inflationData1.rocketVaultBalanceRPL), web3.utils.fromWei(inflationData1.rocketVaultInternalBalanceRPL));

    // Starting amount of total supply
    let totalSupplyStart = web3.utils.toBN(inflationData1.tokenTotalSupply);

    //console.log('TOTAL SUPPLY', totalSupplyStart);

    // Some expected data results based on the passed parameters
    let dailyInflation = web3.utils.toBN((1 + config.yearlyInflationTarget) ** (1 / (365)) * 1e18);
    let expectedInflationLastCalcTime = Number(timeIntervalLastCalc) === 0 && config.timeStart < config.timeClaim ? config.timeStart : Number(timeIntervalLastCalc);
    let expectedInflationIntervalsPassed = Number(inflationData1.inflationIntervalsPassed);

    // Get updated time after fast forward
    currentTime = await getCurrentTime(web3);

     // How many tokens to be expected minted
     let expectedTokensMinted = web3.utils.toBN(0);

    // Are we expecting inflation? have any intervals passed?
    if(inflationData1.inflationIntervalsPassed > 0) {
        // How much inflation to use based on intervals passed
        let newTotalSupply = totalSupplyStart;

       // console.log("nextExpectedClaimBlock", nextExpectedClaimBlock);
        //console.log("expectedInflationIntervalsPassed", expectedInflationIntervalsPassed);
        //console.log((nextExpectedClaimBlock), (blockCurrent+1));

        // Add an extra interval to the calculations match up
        for(let i=0; i < expectedInflationIntervalsPassed; i++) {
            newTotalSupply = newTotalSupply.mul(dailyInflation).div(web3.utils.toBN(1e18));
        }

        // Calculate expected inflation amount
        expectedTokensMinted = newTotalSupply.sub(totalSupplyStart);
    }
   
    // console.log('');
    // console.log('Current time', currentTime);
    // console.log('Inflation start time', Number(inflationData1.inflationStartTime));
    // console.log('Inflation calc time', Number(inflationData1.inflationCalcTime));
    // console.log('Inflation interval time', Number(inflationData1.intervalTime));
    // console.log('Inflation intervals passed', Number(inflationData1.inflationIntervalsPassed));
    // console.log('Inflation calc time expected', Number(expectedInflationLastCalcTime));
    // console.log('Inflation intervals expected', Number(expectedInflationIntervalsPassed));
    // console.log('Inflation next calc time', Number(inflationData1.inflationCalcTime)+Number(inflationData1.intervalTime));
    // console.log('Daily inflation', Number(dailyInflation))

    
    // Claim tokens now
    await gogoTokenGGP.inflationMintTokens(txOptions);

    // Get inflation data
    let inflationData2 = await getInflationData();

    // console.log('');
    // console.log('Current time', await getCurrentTime(web3));
    // console.log('Inflation calc time', Number(inflationData2.inflationCalcTime));

    //console.log(inflationData2.currentBlock, web3.utils.fromWei(inflationData2.tokenTotalSupply), inflationData2.inflationStartBlock.toString(), web3.utils.fromWei(inflationData2.rocketVaultBalanceRPL), web3.utils.fromWei(inflationData2.rocketVaultInternalBalanceRPL));

    // Ending amount of total supply
    let totalSupplyEnd = web3.utils.toBN(inflationData2.tokenTotalSupply);

    // console.log('RESULT', expectedTokensMinted.toString(), (totalSupplyEnd.sub(totalSupplyStart)).toString());
    // console.log(Number(tokenAmountToMatch).toString(), totalSupplyEnd.toString(), totalSupplyStart.toString());

    // Verify the minted amount is correct based on inflation rate etc
    assert(expectedTokensMinted.eq(totalSupplyEnd.sub(totalSupplyStart)), 'Incorrect amount of minted tokens expected');
    // Verify the minted tokens are now stored in Rocket Vault on behalf of Rocket Rewards Pool
    assert(inflationData2.rocketVaultInternalBalanceRPL.eq(inflationData2.rocketVaultBalanceRPL), 'Incorrect amount of tokens stored in Rocket Vault for Rocket Rewards Pool');
    // Are we verifying an exact amount of tokens given as a required parameter on this pass?
    if (tokenAmountToMatch) {
        tokenAmountToMatch = web3.utils.toBN(tokenAmountToMatch);
        assert(tokenAmountToMatch.eq(web3.utils.toBN(totalSupplyEnd).div(web3.utils.toBN(1e18))), 'Given token amount does not match total supply made');
    }

    return (totalSupplyEnd.sub(totalSupplyStart));
}
