import { GoGoTokenGGP,  RocketRewardsPool, RocketClaimTrustedNode, RocketClaimDAO, RocketDAOProtocol, RocketVault } from '../_utils/artifacts';

// Set the address the DAO can receive rewards at
export async function getRewardsDAOTreasuryBalance(txOptions) {
    // Load contracts
    const rocketVault = await RocketVault.deployed();
    const gogoTokenGGP = await GoGoTokenGGP.deployed();
    return rocketVault.balanceOfToken('rocketClaimDAO', gogoTokenGGP.address);
}

// Set the address the DAO can receive rewards at
export async function rewardsClaimDAO(txOptions) {
    // Load contracts
    const rocketVault = await RocketVault.deployed();
    const rocketClaimTrustedNode = await RocketClaimTrustedNode.deployed();
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    const gogoTokenGGP = await GoGoTokenGGP.deployed();

    // Call the mint function on RPL to mint any before we begin so we have accurate figures to work with
    await gogoTokenGGP.inflationMintTokens();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketRewardsPool.getClaimIntervalsPassed(),
            rocketRewardsPool.getClaimIntervalTimeStart(),
            rocketRewardsPool.getRPLBalance(),
            rocketRewardsPool.getClaimingContractPerc('rocketClaimDAO'),
            rocketRewardsPool.getClaimingContractAllowance('rocketClaimDAO'),
            rocketRewardsPool.getClaimingContractTotalClaimed('rocketClaimDAO'),
            rocketRewardsPool.getClaimIntervalRewardsTotal(),
            rocketVault.balanceOfToken('rocketClaimDAO', gogoTokenGGP.address),
        ]).then(
            ([intervalsPassed, intervalTimeStart, poolRPLBalance, daoClaimPerc, daoClaimAllowance, daoContractClaimTotal, intervalRewardsTotal, daoRewardsAddressBalance]) =>
            ({intervalsPassed, intervalTimeStart, poolRPLBalance, daoClaimPerc, daoClaimAllowance, daoContractClaimTotal, intervalRewardsTotal, daoRewardsAddressBalance})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    
    // Perform tx
    await rocketClaimTrustedNode.claim(txOptions);

    // Capture data
    let ds2 = await getTxData();

    //console.log(Number(ds1.intervalsPassed), Number(ds1.intervalTimeStart), Number(web3.utils.fromWei(ds1.daoClaimAllowance)).toFixed(4), Number(web3.utils.fromWei(ds1.daoClaimPerc)), (Number(web3.utils.fromWei(ds1.daoClaimPerc)) * Number(web3.utils.fromWei((ds1.intervalRewardsTotal)))).toFixed(4));
    //console.log(Number(ds2.intervalsPassed), Number(ds2.intervalTimeStart), Number(web3.utils.fromWei(ds2.daoClaimAllowance)).toFixed(4), Number(web3.utils.fromWei(ds2.daoClaimPerc)), (Number(web3.utils.fromWei(ds2.daoClaimPerc)) * Number(web3.utils.fromWei((ds2.intervalRewardsTotal)))).toFixed(4));

    // Verify the claim allowance is correct
    assert(Number(web3.utils.fromWei(ds2.daoClaimAllowance)).toFixed(4) == Number(Number(web3.utils.fromWei(ds2.daoClaimPerc)) * Number(web3.utils.fromWei((ds2.intervalRewardsTotal)))).toFixed(4), 'Contract claim amount total does not equal the expected claim amount');
    // Should be 1 collect per interval
    assert(ds2.daoContractClaimTotal.eq(ds2.daoClaimAllowance), "Amount claimed exceeds allowance for interval");
    // Now test various outcomes depending on if a claim interval happened or not
    if(Number(ds1.intervalTimeStart) < Number(ds2.intervalTimeStart)) {
        // Dao can only receive rewards on the first claim of a claim period
        assert(ds2.daoRewardsAddressBalance.eq(ds1.daoRewardsAddressBalance.add(ds2.daoContractClaimTotal)), "DAO rewards address does not contain the correct balance");
    }else{
        // Claim interval has not passed, dao should not have claimed anything
        assert(ds2.daoRewardsAddressBalance.eq(ds1.daoRewardsAddressBalance), "DAO rewards address balance has changed on same interval claim");
    }
  
};



