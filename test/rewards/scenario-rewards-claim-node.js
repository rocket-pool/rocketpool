import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAOSettings, RocketRewardsPool, RocketClaimTrustedNode, RocketVault } from '../_utils/artifacts';


// Perform rewards claims for Trusted Nodes + Minipools
export async function rewardsClaimTrustedNode(claimIntervalBlocks, txOptions) {

    // Load contracts
    const rocketVault = await RocketVault.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    const rocketClaimTrustedNode = await RocketClaimTrustedNode.deployed();
    
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            web3.eth.getBlockNumber(),
            rocketRewardsPool.getClaimIntervalBlocks(),
            rocketRewardsPool.getClaimIntervalBlockStart(),
            rocketRewardsPool.getClaimIntervalBlockEnd(),
            rocketRewardsPool.getClaimBlockLastMade(),
            rocketRewardsPool.getClaimIntervalsPassed(),
            rocketRewardsPool.getClaimIntervalRewardsTotal(),
            rocketVault.balanceOfToken('rocketRewardsPool', rocketTokenRPL.address),
        ]).then(
            ([currentBlock, claimIntervalBlocks, claimIntervalBlockStart, claimIntervalBlockEnd, claimBlockLast, claimIntervalsPassed, claimIntervalTotal, vaultRPLBalance]) =>
            ({currentBlock, claimIntervalBlocks, claimIntervalBlockStart, claimIntervalBlockEnd, claimBlockLast, claimIntervalsPassed, claimIntervalTotal, vaultRPLBalance})
        );
    }
    // Capture data
    let dataSet1 = await getTxData();
    console.log(dataSet1.currentBlock, dataSet1.claimIntervalBlocks.toString(), dataSet1.claimIntervalBlockStart.toString(), dataSet1.claimIntervalBlockEnd.toString(), dataSet1.claimBlockLast.toString(), dataSet1.claimIntervalsPassed.toString(), dataSet1.vaultRPLBalance.toString());
    // Perform tx
    await rocketClaimTrustedNode.claim(txOptions);
    // Capture data
    let dataSet2 = await getTxData();
    console.log(dataSet2.currentBlock, dataSet2.claimIntervalBlocks.toString(), dataSet2.claimIntervalBlockStart.toString(), dataSet2.claimIntervalBlockEnd.toString(), dataSet2.claimBlockLast.toString(), dataSet2.claimIntervalsPassed.toString(), dataSet2.vaultRPLBalance.toString());
    // Verify
    //assert(dataSet2.inflationIntervalBlocks.eq(web3.utils.toBN(intervalBlocks)), 'Inflation interval blocks not set correctly')
};


