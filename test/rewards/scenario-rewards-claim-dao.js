import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAOSettings, RocketRewardsPool, RocketClaimDAO, RocketClaimTrustedNode, RocketVault } from '../_utils/artifacts';


// Set the address for the DAO rewards
export async function rewardsClaimDAORewardsAddressGet(txOptions) {
    // Load contracts
    const rocketDAOSettings = await RocketDAOSettings.deployed();
    return await rocketDAOSettings.getRewardsDAOAddress.call();
};


// Set the address the DAO can receive rewards at
export async function rewardsClaimDAORewardsAddressSet(daoClaimAddress, txOptions) {
    // Load contracts
    const rocketDAOSettings = await RocketDAOSettings.deployed();
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOSettings.getRewardsDAOAddress(),
        ]).then(
            ([daoClaimAddress]) =>
            ({daoClaimAddress})
        );
    }
    // Capture data
    let dataSet1 = await getTxData();
    // Perform tx
    await rocketDAOSettings.setRewardsDAOAddress(daoClaimAddress, txOptions);
    // Capture data
    let dataSet2 = await getTxData();
    // Verify
    assert(!web3.utils.toBN(dataSet2.daoClaimAddress).isZero(), 'DAO Claim address is not set');
    assert(dataSet2.daoClaimAddress == daoClaimAddress, 'DAO Claim address does not match one given');
};


// Set the address the DAO can receive rewards at
export async function rewardsClaimDAO(txOptions) {
    // Load contracts
    const rocketClaimDAO = await RocketClaimDAO.deployed();
    const rocketClaimTrustedNode = await RocketClaimTrustedNode.deployed();
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();

    // Get the current claim rate for the DAO
    let daoClaimPerc = await rocketRewardsPool.getClaimingContractPerc('rocketClaimDAO');
    // Check if the DAO address that it will receive rewards at is set
    let daoRewardsAddress = await rewardsClaimDAORewardsAddressGet();

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
            rocketClaimDAO.getRewardsBalance(),
            rocketTokenRPL.balanceOf(daoRewardsAddress)
        ]).then(
            ([intervalBlockStart, poolRPLBalance, daoClaimAllowance, daoContractClaimTotal, intervalRewardsTotal, daoClaimContractRPLBalance, daoRewardsAddressBalance]) =>
            ({intervalBlockStart, poolRPLBalance, daoClaimAllowance, daoContractClaimTotal, intervalRewardsTotal, daoClaimContractRPLBalance, daoRewardsAddressBalance})
        );
    }

    // Capture data
    let ds1 = await getTxData();

   // console.log(Number(ds1.intervalBlockStart), web3.utils.fromWei(ds1.daoContractClaimTotal), web3.utils.fromWei(ds1.daoClaimContractRPLBalance), web3.utils.fromWei(ds1.daoRewardsAddressBalance));
    
    // Perform tx
    await rocketClaimTrustedNode.claim(txOptions);
    // Capture data
    let ds2 = await getTxData();

    // console.log(Number(ds2.intervalBlockStart), web3.utils.fromWei(ds2.daoContractClaimTotal), web3.utils.fromWei(ds2.daoClaimContractRPLBalance), web3.utils.fromWei(ds2.daoRewardsAddressBalance));

    // Verify the claim allowance is correct
    assert(Number(web3.utils.fromWei(ds2.daoClaimAllowance)).toFixed(4) == Number(Number(web3.utils.fromWei(daoClaimPerc)) * Number(web3.utils.fromWei((ds2.intervalRewardsTotal)))).toFixed(4), 'Contract claim amount total does not equal the expected claim amount');
    // Should be 1 collect per interval
    assert(ds2.daoContractClaimTotal.eq(ds2.daoClaimAllowance), "Amount claimed exceeds allowance for interval");
    // Now test various outcomes depending on if a claim interval happened or not
    if(Number(ds1.intervalBlockStart) < Number(ds2.intervalBlockStart)) {
        // Dao can only receive rewards on the first claim of a claim period
        // If it's address is set, it should receive the rewards
        if(!web3.utils.toBN(daoRewardsAddress).isZero()) {
            // If the address is set, make sure it has the correct amount from claiming now and any previous balance on the rewards claim contract
            assert(ds2.daoRewardsAddressBalance.eq((ds1.daoRewardsAddressBalance.add(ds2.daoContractClaimTotal.add(ds1.daoClaimContractRPLBalance)))), "DAO rewards address does not contain the correct balance");
        }else{
            // No address is set, the rewards should add up on the claim contract until it is set
            assert(ds2.daoClaimContractRPLBalance.eq((ds1.daoClaimContractRPLBalance.add(ds2.daoContractClaimTotal))), "DAO rewards contract does not contain the correct balance");
        }
    }else{
        // Claim interval has not passed, dao should not have claimed anything
        assert(ds2.daoRewardsAddressBalance.eq(ds1.daoRewardsAddressBalance), "DAO rewards address balance has changed on same interval claim");
        assert(ds2.daoClaimContractRPLBalance.eq(ds1.daoClaimContractRPLBalance), "DAO rewards contract balance has changed on same interval claim");
    }
  
};


