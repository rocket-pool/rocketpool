import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAOSettings, RocketRewardsPool, RocketClaimTrustedNode, RocketVault, RocketNodeManager } from '../_utils/artifacts';


// Can this trusted node make a claim yet? They need to wait 1 claim interval after being made a trusted node
export async function rewardsClaimTrustedNodePossibleGet(trustedNodeAddress, txOptions) {
    // Load contracts
    const rocketClaimTrustedNode = await RocketClaimTrustedNode.deployed();
    return await rocketClaimTrustedNode.getClaimPossible.call(trustedNodeAddress);
};

// Perform rewards claims for Trusted Nodes + Minipools
export async function rewardsClaimTrustedNode(trusedNodeAccount, txOptions) {

    // Load contracts
    const rocketVault = await RocketVault.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    const rocketClaimTrustedNode = await RocketClaimTrustedNode.deployed();
    const rocketNodeManager = await RocketNodeManager.deployed();

    
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            web3.eth.getBlockNumber(),
            rocketRewardsPool.getClaimIntervalBlockStartComputed(),
            rocketRewardsPool.getClaimIntervalContractTotalRewards(rocketClaimTrustedNode.address),
            rocketRewardsPool.getClaimIntervalContractTotalClaimed(rocketClaimTrustedNode.address),
            rocketClaimTrustedNode.getClaimRewardsAmount(txOptions),
            rocketClaimTrustedNode.getClaimIntervalTrustedNodeTotal(),
            rocketNodeManager.getNodeTrustedBlock(trusedNodeAccount),

            /*
            rocketNodeManager.getNodeTrustedBlock(trusedNodeAccount),
            rocketRewardsPool.getClaimIntervalNextBlocksNeeded(),
            rocketClaimTrustedNode.getClaimPossible(trusedNodeAccount),
            rocketRewardsPool.getClaimIntervalBlocks(),
            rocketRewardsPool.getClaimIntervalBlockStart(),
            rocketRewardsPool.getClaimBlockLastMade(),
            rocketRewardsPool.getClaimIntervalsPassed(),
            rocketRewardsPool.getClaimIntervalRewardsTotal(),
            rocketVault.balanceOfToken('rocketRewardsPool', rocketTokenRPL.address),
            */
            
            
        ]).then(
            ([currentBlock, claimIntervalBlockStart, contractClaimAllowance, contractClaimTotal, trustedNodeClaimAmount, trustedNodeClaimIntervalTotal, nodeTrustedBlock]) =>
            ({currentBlock, claimIntervalBlockStart, contractClaimAllowance, contractClaimTotal, trustedNodeClaimAmount, trustedNodeClaimIntervalTotal, nodeTrustedBlock})
        );
    }
    // Capture data
    let ds1 = await getTxData();
    
    //console.log(ds1.currentBlock, web3.utils.fromWei(ds1.claimIntervalBlockStart), Number(ds1.trustedNodeClaimIntervalTotal), web3.utils.fromWei(ds1.contractClaimTotal), web3.utils.fromWei(ds1.contractClaimAllowance), Number(ds1.nodeTrustedBlock));

    // Get the claim amount 
    // let claimAmountExpected = await rocketClaimTrustedNode.getClaimRewardsAmount(txOptions);
    // console.log(web3.utils.fromWei(claimAmountExpected.toString()));
    // Perform tx
    await rocketClaimTrustedNode.claim(txOptions);
    // Capture data
    let ds2 = await getTxData();

    // console.log(ds2.currentBlock, web3.utils.fromWei(ds2.claimIntervalBlockStart), Number(ds2.trustedNodeClaimIntervalTotal), web3.utils.fromWei(ds2.contractClaimTotal), web3.utils.fromWei(ds2.contractClaimAllowance), Number(ds2.nodeTrustedBlock));
    //console.log('-----INTERVALS---------', Number(ds1.claimIntervalBlockStart), Number(ds2.claimIntervalBlockStart));

    // Verify 
    assert(ds2.contractClaimTotal.eq(ds1.contractClaimTotal.add(ds1.trustedNodeClaimAmount)), 'Contract claim amount total incorrect');
    assert(ds2.contractClaimTotal.lte(ds1.contractClaimAllowance), 'Trusted node claimed more than contracts allowance');
         
  
};


