import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAOSettings, RocketRewardsPool, RocketClaimTrustedNode, RocketVault, RocketNodeManager } from '../_utils/artifacts';
import { rewardsClaimIntervalBlocksSet, rewardsClaimerPercSet } from './scenario-rewards-claim';


// Can this trusted node make a claim yet? They need to wait 1 claim interval after being made a trusted node
export async function rewardsClaimTrustedNodePossibleGet(trustedNodeAddress, txOptions) {
    // Load contracts
    const rocketClaimTrustedNode = await RocketClaimTrustedNode.deployed();
    return await rocketClaimTrustedNode.getClaimPossible.call(trustedNodeAddress);
};

// Get the current rewards claim period in blocks
export async function rewardsClaimTrustedNodeRegisteredBlockGet(trustedNodeAddress, txOptions) {
    // Load contracts
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    const rocketClaimTrustedNode = await RocketClaimTrustedNode.deployed();
    // Do it
    return await rocketRewardsPool.getClaimContractRegisteredBlock.call(rocketClaimTrustedNode.address, trustedNodeAddress);
};

// Perform rewards claims for Trusted Nodes + Minipools
export async function rewardsClaimTrustedNode(trusedNodeAccount, txOptions, expectedClaimPerc = null) {

    // Load contracts
    const rocketVault = await RocketVault.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    const rocketClaimTrustedNode = await RocketClaimTrustedNode.deployed();

    
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            web3.eth.getBlockNumber(),
            rocketRewardsPool.getClaimIntervalBlockStartComputed(),
            rocketRewardsPool.getClaimingContractAllowance('rocketClaimTrustedNode'),
            rocketRewardsPool.getClaimingContractTotalClaimed('rocketClaimTrustedNode'),
            rocketRewardsPool.getClaimingContractPerc('rocketClaimTrustedNode'),
            rocketClaimTrustedNode.getClaimRewardsAmount(txOptions),
            rocketRewardsPool.getClaimingContractUserTotalCurrent('rocketClaimTrustedNode'),
   
        ]).then(
            ([currentBlock, claimIntervalBlockStart, contractClaimAllowance, contractClaimTotal, contractClaimPerc, trustedNodeClaimAmount, trustedNodeClaimIntervalTotal]) =>
            ({currentBlock, claimIntervalBlockStart, contractClaimAllowance, contractClaimTotal, contractClaimPerc, trustedNodeClaimAmount, trustedNodeClaimIntervalTotal})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Perform tx
    await rocketClaimTrustedNode.claim(txOptions);

    // Capture data
    let ds2 = await getTxData();


    // Verify 
    if(Number(ds1.claimIntervalBlockStart) == Number(ds2.claimIntervalBlockStart)) {
        // Claim occured in the same interval
        assert(ds2.contractClaimTotal.eq(ds1.contractClaimTotal.add(ds1.trustedNodeClaimAmount)), 'Contract claim amount total incorrect');
        // How many trusted nodes where in this interval? Their % claimed should be equal to that
        assert(Number(web3.utils.fromWei(ds1.trustedNodeClaimAmount)).toFixed(4) == Number(web3.utils.fromWei(ds2.contractClaimAllowance.div(ds2.trustedNodeClaimIntervalTotal))).toFixed(4), 'Contract claim amount should be equal to their desired equal allocation');
        // The contracts claim perc should never change after a claim in the same interval
        if(expectedClaimPerc) assert(expectedClaimPerc == Number(web3.utils.fromWei(ds2.contractClaimPerc)), "Contracts claiming percentage changed in an interval");
    }else{
        // Check to see if the claim tx has pushed us into a new claim interval
        // The contracts claim total should be greater than 0 due to the claim that just occured
        assert(ds2.contractClaimTotal.gt(0), 'Contract claim amount should be > 0 for new interval');
        // How many trusted nodes where in this interval? Their % claimed should be equal to that
        assert(Number(web3.utils.fromWei(ds2.contractClaimTotal)).toFixed(4) == Number(web3.utils.fromWei(ds2.contractClaimAllowance.div(ds2.trustedNodeClaimIntervalTotal))).toFixed(4), 'Contract claim amount should be equal to their desired equal allocation');
    }
    // Always verify
    // Can't claim more than contracts allowance
    assert(ds2.contractClaimTotal.lte(ds1.contractClaimAllowance), 'Trusted node claimed more than contracts allowance');
    
  
};


