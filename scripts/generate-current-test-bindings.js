#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { runTypeChain } = require('typechain');

const currentArtifactPaths = [
    'artifacts/contracts/contract/RocketStorage.sol/RocketStorage.json',
    'artifacts/contracts/contract/RocketVault.sol/RocketVault.json',
    'artifacts/contracts/contract/auction/RocketAuctionManager.sol/RocketAuctionManager.json',
    'artifacts/contracts/contract/dao/RocketDAOProposal.sol/RocketDAOProposal.json',
    'artifacts/contracts/contract/dao/protocol/RocketDAOProtocol.sol/RocketDAOProtocol.json',
    'artifacts/contracts/contract/dao/node/RocketDAONodeTrusted.sol/RocketDAONodeTrusted.json',
    'artifacts/contracts/contract/dao/node/RocketDAONodeTrustedActions.sol/RocketDAONodeTrustedActions.json',
    'artifacts/contracts/contract/dao/node/RocketDAONodeTrustedProposals.sol/RocketDAONodeTrustedProposals.json',
    'artifacts/contracts/contract/dao/node/RocketDAONodeTrustedUpgrade.sol/RocketDAONodeTrustedUpgrade.json',
    'artifacts/contracts/contract/dao/node/settings/RocketDAONodeTrustedSettingsMembers.sol/RocketDAONodeTrustedSettingsMembers.json',
    'artifacts/contracts/contract/dao/node/settings/RocketDAONodeTrustedSettingsMinipool.sol/RocketDAONodeTrustedSettingsMinipool.json',
    'artifacts/contracts/contract/dao/node/settings/RocketDAONodeTrustedSettingsProposals.sol/RocketDAONodeTrustedSettingsProposals.json',
    'artifacts/contracts/contract/dao/security/RocketDAOSecurity.sol/RocketDAOSecurity.json',
    'artifacts/contracts/contract/dao/security/RocketDAOSecurityActions.sol/RocketDAOSecurityActions.json',
    'artifacts/contracts/contract/dao/security/RocketDAOSecurityProposals.sol/RocketDAOSecurityProposals.json',
    'artifacts/contracts/contract/dao/security/RocketDAOSecurityUpgrade.sol/RocketDAOSecurityUpgrade.json',
    'artifacts/contracts/contract/node/RocketNodeManager.sol/RocketNodeManager.json',
    'artifacts/contracts/contract/node/RocketNodeStaking.sol/RocketNodeStaking.json',
    'artifacts/contracts/contract/node/RocketNodeDistributorFactory.sol/RocketNodeDistributorFactory.json',
    'artifacts/contracts/contract/node/RocketNodeDistributorDelegate.sol/RocketNodeDistributorDelegate.json',
    'artifacts/contracts/contract/token/RocketTokenRPL.sol/RocketTokenRPL.json',
    'artifacts/contracts/contract/token/temp/RocketTokenDummyRPL.sol/RocketTokenDummyRPL.json',
    'artifacts/contracts/contract/token/RocketTokenRETH.sol/RocketTokenRETH.json',
    'artifacts/contracts/contract/deposit/RocketDepositPool.sol/RocketDepositPool.json',
    'artifacts/contracts/contract/node/RocketNodeDeposit.sol/RocketNodeDeposit.json',
    'artifacts/contracts/contract/minipool/RocketMinipoolManager.sol/RocketMinipoolManager.json',
    'artifacts/contracts/contract/minipool/RocketMinipoolFactory.sol/RocketMinipoolFactory.json',
    'artifacts/contracts/contract/minipool/RocketMinipoolDelegate.sol/RocketMinipoolDelegate.json',
    'artifacts/contracts/contract/minipool/RocketMinipoolBase.sol/RocketMinipoolBase.json',
    'artifacts/contracts/contract/minipool/RocketMinipoolPenalty.sol/RocketMinipoolPenalty.json',
    'artifacts/contracts/contract/megapool/RocketMegapoolFactory.sol/RocketMegapoolFactory.json',
    'artifacts/contracts/contract/megapool/RocketMegapoolManager.sol/RocketMegapoolManager.json',
    'artifacts/contracts/contract/megapool/RocketMegapoolDelegate.sol/RocketMegapoolDelegate.json',
    'artifacts/contracts/contract/megapool/RocketMegapoolProxy.sol/RocketMegapoolProxy.json',
    'artifacts/contracts/contract/megapool/RocketMegapoolPenalties.sol/RocketMegapoolPenalties.json',
    'artifacts/contracts/contract/helper/BeaconStateVerifierMock.sol/BeaconStateVerifierMock.json',
    'artifacts/contracts/contract/dao/protocol/settings/RocketDAOProtocolSettingsNode.sol/RocketDAOProtocolSettingsNode.json',
    'artifacts/contracts/contract/dao/protocol/settings/RocketDAOProtocolSettingsRewards.sol/RocketDAOProtocolSettingsRewards.json',
    'artifacts/contracts/contract/dao/protocol/settings/RocketDAOProtocolSettingsNetwork.sol/RocketDAOProtocolSettingsNetwork.json',
    'artifacts/contracts/contract/dao/protocol/settings/RocketDAOProtocolSettingsMegapool.sol/RocketDAOProtocolSettingsMegapool.json',
    'artifacts/contracts/contract/dao/protocol/settings/RocketDAOProtocolSettingsMinipool.sol/RocketDAOProtocolSettingsMinipool.json',
    'artifacts/contracts/contract/dao/protocol/settings/RocketDAOProtocolSettingsDeposit.sol/RocketDAOProtocolSettingsDeposit.json',
    'artifacts/contracts/contract/dao/protocol/settings/RocketDAOProtocolSettingsAuction.sol/RocketDAOProtocolSettingsAuction.json',
    'artifacts/contracts/contract/dao/protocol/settings/RocketDAOProtocolSettingsSecurity.sol/RocketDAOProtocolSettingsSecurity.json',
    'artifacts/contracts/contract/network/RocketNetworkPrices.sol/RocketNetworkPrices.json',
    'artifacts/contracts/contract/network/RocketNetworkBalances.sol/RocketNetworkBalances.json',
    'artifacts/contracts/contract/network/RocketNetworkVoting.sol/RocketNetworkVoting.json',
    'artifacts/contracts/contract/network/RocketNetworkRevenues.sol/RocketNetworkRevenues.json',
    'artifacts/contracts/contract/network/RocketNetworkExit.sol/RocketNetworkExit.json',
    'artifacts/contracts/contract/network/RocketNetworkPenalties.sol/RocketNetworkPenalties.json',
    'artifacts/contracts/contract/rewards/RocketClaimDAO.sol/RocketClaimDAO.json',
    'artifacts/contracts/contract/rewards/RocketRewardsPool.sol/RocketRewardsPool.json',
    'artifacts/contracts/contract/rewards/RocketSmoothingPool.sol/RocketSmoothingPool.json',
    'artifacts/contracts/contract/rewards/RocketMerkleDistributorMainnet.sol/RocketMerkleDistributorMainnet.json',
    'artifacts/contracts/contract/upgrade/RocketUpgradeOneDotFive.sol/RocketUpgradeOneDotFive.json',
];

const fixtureArtifactPaths = [
    'artifacts/contracts/contract/helper/RevertOnTransfer.sol/RevertOnTransfer.json',
    'artifacts/contracts/contract/helper/WithdrawalRequestPredeployMock.sol/WithdrawalRequestPredeployMock.json',
    'artifacts/contracts/contract/helper/RplStakeController.sol/RplStakeController.json',
    'artifacts/contracts/contract/helper/PenaltyTest.sol/PenaltyTest.json',
    'artifacts/contracts/contract/helper/StorageHelper.sol/StorageHelper.json',
    'artifacts/contracts/contract/helper/MegapoolUpgradeHelper.sol/MegapoolUpgradeHelper.json',
];

function resolveArtifacts(workspace, artifactPaths, label) {
    return artifactPaths.map(artifactPath => {
        const absolute = path.resolve(workspace, artifactPath);
        if (!fs.existsSync(absolute)) {
            throw new Error(`${label} binding artifact does not exist after compilation: ${artifactPath}`);
        }
        return absolute;
    });
}

async function generateBindings(workspace, allowedParent, name, artifactPaths, label) {
    const outputDirectory = path.resolve(allowedParent, name);
    if (path.dirname(outputDirectory) !== allowedParent || path.basename(outputDirectory) !== name) {
        throw new Error(`Refusing to replace unexpected output directory: ${outputDirectory}`);
    }

    const artifacts = resolveArtifacts(workspace, artifactPaths, label);
    fs.rmSync(outputDirectory, { recursive: true, force: true });

    const result = await runTypeChain({
        cwd: workspace,
        target: 'ethers-v6',
        outDir: outputDirectory,
        allFiles: artifacts,
        filesToProcess: artifacts,
    });
    console.log(`Generated ${result.filesGenerated} ${label} harness typings`);
}

async function main() {
    const workspace = process.cwd();
    const allowedParent = path.resolve(workspace, 'test/harness/bindings');

    await generateBindings(
        workspace,
        allowedParent,
        'current',
        currentArtifactPaths,
        'current Rocket Pool',
    );
    await generateBindings(
        workspace,
        allowedParent,
        'fixtures',
        fixtureArtifactPaths,
        'fixture',
    );
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
