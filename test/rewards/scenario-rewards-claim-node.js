import { mineBlocks } from '../_utils/evm';
import { RocketTokenRPL, RocketDAOSettings, RocketRewardsPool, RocketClaimTrustedNode } from '../_utils/artifacts';


// Perform rewards claims for Trusted Nodes + Minipools
export async function rewardsClaimTrustedNode(txOptions) {

    // Load contracts
    const rocketRewardsPool = await RocketRewardsPool.deployed();
    const rocketClaimContact = await RocketClaimTrustedNode.deployed();
    
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketRewardsPool.canClaim(),
        ]).then(
            ([rewardsCanClaim]) =>
            ({rewardsCanClaim})
        );
    }
    // Capture data
    let dataSet1 = await getTxData();
    console.log(dataSet1.rewardsCanClaim);
    // Perform tx
    await rocketRewardsPool.claim(txOptions);
    // Capture data
    let dataSet2 = await getTxData();
    console.log(dataSet2.rewardsCanClaim);
    // Verify
    //assert(dataSet2.inflationIntervalBlocks.eq(web3.utils.toBN(intervalBlocks)), 'Inflation interval blocks not set correctly')
};


