// Dissolve a minipool
import {
    RocketDAONodeTrusted,
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsNode,
    RocketMinipoolManager,
    RocketMinipoolManagerNew,
    RocketNetworkPrices,
    RocketNodeStaking,
    RocketNodeStakingNew,
    RocketTokenRPL,
    RocketVault,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import { minipoolStates } from '../_helpers/minipool';


export async function voteScrub(minipool, txOptions) {
    // Get minipool owner
    const nodeAddress = await minipool.getNodeAddress.call();

    // Get contracts
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    const rocketDAONodeTrustedSettingsMinipool = await RocketDAONodeTrustedSettingsMinipool.deployed();

    // Get minipool details
    function getMinipoolDetails() {
        return Promise.all([
            minipool.getStatus.call(),
            minipool.getUserDepositBalance.call(),
            hre.web3.eth.getBalance(minipool.address),
            minipool.getTotalScrubVotes.call(),
            rocketNodeStaking.getNodeRPLStake.call(nodeAddress),
            rocketDAONodeTrustedSettingsMinipool.getScrubPenaltyEnabled(),
            minipool.getVacant.call(),
        ]).then(
            ([status, userDepositBalance, minipoolBalance, votes, nodeRPLStake, penaltyEnabled, vacant]) =>
            ({status, userDepositBalance, minipoolBalance: hre.web3.utils.toBN(minipoolBalance), votes, nodeRPLStake, penaltyEnabled, vacant})
        );
    }

    // Get initial minipool details
    let details1 = await getMinipoolDetails();

    // Dissolve
    await minipool.voteScrub(txOptions);

    // Get updated minipool details
    let details2 = await getMinipoolDetails();

    // Get member count
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const memberCount = await rocketDAONodeTrusted.getMemberCount();
    const quorum = memberCount.div('2'.BN);

    // Check state
    if (details1.votes.add('1'.BN).gt(quorum)){
        assertBN.equal(details2.status, minipoolStates.Dissolved, 'Incorrect updated minipool status');
        // Check if vacant
        if (!details1.vacant) {
            // Check slashing if penalties are enabled
            if (details1.penaltyEnabled) {
                // Check user deposit balance + 2.4 eth penalty left the minipool
                const minipoolBalanceDiff = details2.minipoolBalance.sub(details1.minipoolBalance);
                assertBN.equal(minipoolBalanceDiff, details1.userDepositBalance.add('2.4'.ether).neg(), 'User balance is incorrect');
            } else {
                // Check user deposit balance left the minipool
                const minipoolBalanceDiff = details2.minipoolBalance.sub(details1.minipoolBalance);
                assertBN.equal(minipoolBalanceDiff, details1.userDepositBalance.neg(), 'User balance is incorrect');
            }
        } else {
            // Expect no change in minipool balance
            const minipoolBalanceDiff = details2.minipoolBalance.sub(details1.minipoolBalance);
            assertBN.equal(minipoolBalanceDiff, '0'.BN, 'User balance is incorrect');
            // Expect pubkey -> minipool mapping to be removed
            const rocketMinipoolManager = await RocketMinipoolManager.deployed();
            const actualPubKey = await rocketMinipoolManager.getMinipoolPubkey(minipool.address);
            const reverseAddress = await rocketMinipoolManager.getMinipoolByPubkey(actualPubKey);
            assert.equal(reverseAddress, "0x0000000000000000000000000000000000000000");
        }
    } else {
        assertBN.equal(details2.votes.sub(details1.votes), 1, 'Vote count not incremented');
        assertBN.notEqual(details2.status, minipoolStates.Dissolved, 'Incorrect updated minipool status');
        assertBN.equal(details2.nodeRPLStake, details1.nodeRPLStake, 'RPL was slashed');
    }
}
