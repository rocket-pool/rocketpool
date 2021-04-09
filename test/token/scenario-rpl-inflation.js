import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketVault, RocketRewardsPool } from '../_utils/artifacts';



// Get the current inflation period in blocks
export async function rplInflationIntervalBlocksGet(txOptions) {
    // Load contracts
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    return await rocketTokenRPL.getInflationIntervalBlocks.call();
};


// Claim the inflation after a set amount of blocks have passed
export async function rplClaimInflation(config, txOptions, tokenAmountToMatch = null) {

    // Load contracts
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    const rocketVault = await RocketVault.deployed();

    // Get the previously last inflation calculated block
    const blockIntervalLastCalc = web3.utils.toBN(await rocketTokenRPL.getInflationCalcBlock.call());

    // Get data about the current inflation
    function getInflationData() {
        return Promise.all([
            web3.eth.getBlockNumber(),
            rocketTokenRPL.totalSupply.call(),
            rocketTokenRPL.getInflationIntervalStartBlock.call(),
            rocketTokenRPL.getInlfationIntervalsPassed.call(),
            rocketTokenRPL.getInflationCalcBlock.call(),
            rocketTokenRPL.getInflationIntervalBlocks.call(),
            rocketTokenRPL.balanceOf(rocketVault.address),
            rocketVault.balanceOfToken('rocketRewardsPool', rocketTokenRPL.address),
        ]).then(
            ([currentBlock, tokenTotalSupply, inflationStartBlock, inflationIntervalsPassed, inflationCalcBlock, intervalBlocks, rocketVaultBalanceRPL, rocketVaultInternalBalanceRPL]) =>
            ({currentBlock, tokenTotalSupply, inflationStartBlock, inflationIntervalsPassed, inflationCalcBlock, intervalBlocks, rocketVaultBalanceRPL, rocketVaultInternalBalanceRPL})
        );
    }

    // Get the current block so we can calculate how many blocks to mine to make it to the claim block
    let blockCurrent = await web3.eth.getBlockNumber();

    // Blocks to process as passing
    let blocksToSimulatePassing = config.blockClaim - blockCurrent;
    // Process the blocks now to simulate blocks passing (need minus 1 block as the 'inflationMintTokens' tx triggers a new block with ganache which is equal to the claim block)
    await mineBlocks(web3, blocksToSimulatePassing);  

    // Get initial data
    let inflationData1 = await getInflationData();
    //console.log(inflationData1.currentBlock, web3.utils.fromWei(inflationData1.tokenTotalSupply), inflationData1.inflationStartBlock.toString(), web3.utils.fromWei(inflationData1.rocketVaultBalanceRPL), web3.utils.fromWei(inflationData1.rocketVaultInternalBalanceRPL));

    // Starting amount of total supply
    let totalSupplyStart = web3.utils.fromWei(inflationData1.tokenTotalSupply);

    //console.log('TOTAL SUPPLY', totalSupplyStart);

    // Some expected data results based on the passed parameters
    let expectedInflationDaily = (1 + config.yearlyInflationTarget) ** (1 / (365));
    let expectedInflationLastCalcBlock = Number(blockIntervalLastCalc) == 0 && config.blockStart < config.blockClaim ? config.blockStart : Number(blockIntervalLastCalc);
    let expectedInflationIntervalsPassed = Number(inflationData1.inflationIntervalsPassed);
    // Get updated block number after processing blocks
    blockCurrent = await web3.eth.getBlockNumber();
     // How many tokens to be epected minted
     let expectedTokensMinted = 0;
    // Are we expecting inflation? have any intervals passed?
    if(inflationData1.inflationIntervalsPassed > 0) {
        // How much inflation to use based on intervals passed
        let expectedInflationAmount = expectedInflationDaily;
        // Check the next expected claim block, since ganache triggers a block when it does the mint function, we need to anticipate that
        let nextExpectedClaimBlock = (Number(expectedInflationLastCalcBlock)+(Number(inflationData1.intervalBlocks)*Number(inflationData1.inflationIntervalsPassed))) + Number(inflationData1.intervalBlocks);
        // Is it going to trigger another claim on the txt that occurs?
        expectedInflationIntervalsPassed = nextExpectedClaimBlock == (blockCurrent+1) ? expectedInflationIntervalsPassed+1 : expectedInflationIntervalsPassed;
       // console.log("nextExpectedClaimBlock", nextExpectedClaimBlock);
        //console.log("expectedInflationIntervalsPassed", expectedInflationIntervalsPassed);
        //console.log((nextExpectedClaimBlock), (blockCurrent+1));
        // Add an extra interval to the calculations match up
        for(let i=1; i < expectedInflationIntervalsPassed; i++) {
            expectedInflationAmount = (expectedInflationAmount * expectedInflationDaily);
        }
        expectedTokensMinted = (expectedInflationAmount * totalSupplyStart) - totalSupplyStart;
    }
   
    /*
    console.log('');
    console.log('Current block', await web3.eth.getBlockNumber());
    console.log('Inflation start block', Number(inflationData1.inflationStartBlock));
    console.log('Inflation calc block', Number(inflationData1.inflationCalcBlock));
    console.log('Inflation interval blocks', Number(inflationData1.intervalBlocks));
    console.log('Inflation intervals passed', Number(inflationData1.inflationIntervalsPassed));
    console.log('Inflation calc block expected', Number(expectedInflationLastCalcBlock));
    console.log('Inflation intervals expected', Number(expectedInflationIntervalsPassed));
    console.log('Inflation next calc block', Number(inflationData1.inflationCalcBlock)+Number(inflationData1.intervalBlocks));
    */
    
    
    // Claim tokens now
    await rocketTokenRPL.inflationMintTokens(txOptions);

    // Get inflation data
    let inflationData2 = await getInflationData();

    //console.log('');
    //console.log('Current block', await web3.eth.getBlockNumber());
    //console.log('Inflation calc block', Number(inflationData2.inflationCalcBlock));

    
    //console.log(inflationData2.currentBlock, web3.utils.fromWei(inflationData2.tokenTotalSupply), inflationData2.inflationStartBlock.toString(), web3.utils.fromWei(inflationData2.rocketVaultBalanceRPL), web3.utils.fromWei(inflationData2.rocketVaultInternalBalanceRPL));

    // Ending amount of total supply
    let totalSupplyEnd = web3.utils.fromWei(inflationData2.tokenTotalSupply);

    //console.log('RESULT', expectedTokensMinted.toFixed(4), (totalSupplyEnd - totalSupplyStart).toFixed(4));
    //console.log(Number(tokenAmountToMatch).toFixed(4), Number(totalSupplyEnd).toFixed(4), Number(totalSupplyStart).toFixed(4));

    // Verify the minted amount is correct based on inflation rate etc
    assert(expectedTokensMinted.toFixed(4) == (totalSupplyEnd - totalSupplyStart).toFixed(4), 'Incorrect amount of minted tokens expected');
    // Verify the minted tokens are now stored in Rocket Vault on behalf of Rocket Rewards Pool
    assert(inflationData2.rocketVaultInternalBalanceRPL.eq(inflationData2.rocketVaultBalanceRPL), 'Incorrect amount of tokens stored in Rocket Vault for Rocket Rewards Pool');
    // Are we verifying an exact amount of tokens given as a required parameter on this pass?
    if(tokenAmountToMatch) assert(Number(tokenAmountToMatch).toFixed(4) == Number(totalSupplyEnd).toFixed(4), 'Given token amount does not match total supply made');

}
