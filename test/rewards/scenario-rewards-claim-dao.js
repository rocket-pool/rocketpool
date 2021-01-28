import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAONetworkSettings, RocketRewardsPool, RocketClaimDAO, RocketClaimTrustedNode, RocketDAONetwork, RocketVault } from '../_utils/artifacts';



// Set the address the DAO can receive rewards at
export async function rewardsClaimDAO(txOptions) {
    // Load contracts
    const rocketVault = await RocketVault.deployed();
    const rocketDAONetwork = await RocketDAONetwork.deployed();
    const rocketClaimTrustedNode = await RocketClaimTrustedNode.deployed();
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Get the current claim rate for the DAO
    let daoClaimPerc = await rocketRewardsPool.getClaimingContractPerc('rocketClaimDAO');

    // Call the mint function on RPL to mint any before we begin so we have accurate figures to work with
    if(await rocketTokenRPL.getInlfationIntervalsPassed() > 0) await rocketTokenRPL.inflationMintTokens();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketRewardsPool.getClaimIntervalBlockStart(),
            rocketRewardsPool.getRPLBalance(),
            rocketRewardsPool.getClaimingContractAllowance('rocketClaimDAO'),
            rocketRewardsPool.getClaimingContractTotalClaimed('rocketClaimDAO'),
            rocketRewardsPool.getClaimIntervalRewardsTotal(),
            rocketVault.balanceOfToken('rocketClaimDAO', rocketTokenRPL.address),
        ]).then(
            ([intervalBlockStart, poolRPLBalance, daoClaimAllowance, daoContractClaimTotal, intervalRewardsTotal, daoRewardsAddressBalance]) =>
            ({intervalBlockStart, poolRPLBalance, daoClaimAllowance, daoContractClaimTotal, intervalRewardsTotal, daoRewardsAddressBalance})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    
    // Perform tx
    await rocketClaimTrustedNode.claim(txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Verify the claim allowance is correct
    assert(Number(web3.utils.fromWei(ds2.daoClaimAllowance)).toFixed(4) == Number(Number(web3.utils.fromWei(daoClaimPerc)) * Number(web3.utils.fromWei((ds2.intervalRewardsTotal)))).toFixed(4), 'Contract claim amount total does not equal the expected claim amount');
    // Should be 1 collect per interval
    assert(ds2.daoContractClaimTotal.eq(ds2.daoClaimAllowance), "Amount claimed exceeds allowance for interval");
    // Now test various outcomes depending on if a claim interval happened or not
    if(Number(ds1.intervalBlockStart) < Number(ds2.intervalBlockStart)) {
        // Dao can only receive rewards on the first claim of a claim period
        assert(ds2.daoRewardsAddressBalance.eq(ds1.daoRewardsAddressBalance.add(ds2.daoContractClaimTotal)), "DAO rewards address does not contain the correct balance");

    }else{
        // Claim interval has not passed, dao should not have claimed anything
        assert(ds2.daoRewardsAddressBalance.eq(ds1.daoRewardsAddressBalance), "DAO rewards address balance has changed on same interval claim");
    }
  
};


