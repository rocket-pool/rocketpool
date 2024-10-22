const hre = require('hardhat');
const ethers = hre.ethers;

class Artifact {
    constructor(name) {
        this.name = name;
        this.abi = hre.artifacts.readArtifactSync(name).abi;
        this.instance = null;
    }

    async deployed() {
        return this.instance;
    }

    setAsDeployed(instance) {
        this.instance = instance;
    }

    async new(...args) {
        this.instance = (await ethers.getContractFactory(this.name)).deploy(...args);
        return this.instance;
    }

    async clone(...args) {
        return (await ethers.getContractFactory(this.name)).deploy(...args);
    }

    at (address) {
        return new ethers.Contract(address, this.abi, hre.ethers.provider);
    }
}

class Artifacts {
    constructor() {
        this.artifacts = {};
    }

    require(name) {
        if (!this.artifacts.hasOwnProperty(name)) {
            this.artifacts[name] = new Artifact(name);
        }
        return this.artifacts[name];
    }
}

export const artifacts = new Artifacts();

export const RocketAuctionManager = artifacts.require('RocketAuctionManager');
export const RocketClaimDAO = artifacts.require('RocketClaimDAO');
export const RocketDAONodeTrusted = artifacts.require('RocketDAONodeTrusted');
export const RocketDAONodeTrustedActions = artifacts.require('RocketDAONodeTrustedActions');
export const RocketDAONodeTrustedProposals = artifacts.require('RocketDAONodeTrustedProposals');
export const RocketDAONodeTrustedSettingsMembers = artifacts.require('RocketDAONodeTrustedSettingsMembers');
export const RocketDAONodeTrustedSettingsProposals = artifacts.require('RocketDAONodeTrustedSettingsProposals');
export const RocketDAONodeTrustedSettingsMinipool = artifacts.require('RocketDAONodeTrustedSettingsMinipool');
export const RocketDAONodeTrustedUpgrade = artifacts.require('RocketDAONodeTrustedUpgrade');
export const RocketDAOProtocol = artifacts.require('RocketDAOProtocol');
export const RocketDAOProtocolProposals = artifacts.require('RocketDAOProtocolProposals');
export const RocketDAOProtocolProposal = artifacts.require('RocketDAOProtocolProposal');
export const RocketDAOProtocolSettingsAuction = artifacts.require('RocketDAOProtocolSettingsAuction');
export const RocketDAOProtocolSettingsDeposit = artifacts.require('RocketDAOProtocolSettingsDeposit');
export const RocketDAOProtocolSettingsInflation = artifacts.require('RocketDAOProtocolSettingsInflation');
export const RocketDAOProtocolSettingsNetwork = artifacts.require('RocketDAOProtocolSettingsNetwork');
export const RocketDAOProtocolSettingsNode = artifacts.require('RocketDAOProtocolSettingsNode');
export const RocketDAOProtocolSettingsRewards = artifacts.require('RocketDAOProtocolSettingsRewards');
export const RocketDAOProtocolSettingsProposals = artifacts.require('RocketDAOProtocolSettingsProposals');
export const RocketDAOProtocolSettingsSecurity = artifacts.require('RocketDAOProtocolSettingsSecurity');
export const RocketDAOProtocolVerifier = artifacts.require('RocketDAOProtocolVerifier');
export const RocketDAOProposal = artifacts.require('RocketDAOProposal');
export const RocketDAOSecurityActions = artifacts.require('RocketDAOSecurityActions');
export const RocketDAOSecurityProposals = artifacts.require('RocketDAOSecurityProposals');
export const RocketDAOSecurity = artifacts.require('RocketDAOSecurity');
export const RocketMinipoolPenalty = artifacts.require('RocketMinipoolPenalty');
export const RocketMinipoolManager = artifacts.require('RocketMinipoolManager');
export const RocketNetworkBalances = artifacts.require('RocketNetworkBalances');
export const RocketNetworkPenalties = artifacts.require('RocketNetworkPenalties');
export const RocketNetworkFees = artifacts.require('RocketNetworkFees');
export const RocketNetworkPrices = artifacts.require('RocketNetworkPrices');
export const RocketNodeManager = artifacts.require('RocketNodeManager');
export const RocketNodeStaking = artifacts.require('RocketNodeStaking');
export const RocketNodeDistributorFactory = artifacts.require('RocketNodeDistributorFactory');
export const RocketNodeDistributorDelegate = artifacts.require('RocketNodeDistributorDelegate');
export const RocketRewardsPool = artifacts.require('RocketRewardsPool');
export const RocketMerkleDistributorMainnet = artifacts.require('RocketMerkleDistributorMainnet');
export const RocketSmoothingPool = artifacts.require('RocketSmoothingPool');
export const RocketStorage = artifacts.require('RocketStorage');
export const RocketTokenDummyRPL = artifacts.require('RocketTokenDummyRPL');
export const RocketTokenRETH = artifacts.require('RocketTokenRETH');
export const RocketTokenRPL = artifacts.require('RocketTokenRPL');
export const RocketVault = artifacts.require('RocketVault');
export const RevertOnTransfer = artifacts.require('RevertOnTransfer');
export const PenaltyTest = artifacts.require('PenaltyTest');
export const SnapshotTest = artifacts.require('SnapshotTest');
export const RocketMegapoolFactory = artifacts.require('RocketMegapoolFactory');
export const RocketMegapoolDelegate = artifacts.require('RocketMegapoolDelegate');
export const RocketMegapoolProxy = artifacts.require('RocketMegapoolProxy');
export const RocketMinipoolFactory = artifacts.require('RocketMinipoolFactory');
export const RocketMinipoolBase = artifacts.require('RocketMinipoolBase');
export const RocketMinipoolQueue = artifacts.require('RocketMinipoolQueue');
export const RocketNodeDeposit = artifacts.require('RocketNodeDeposit');
export const RocketMinipoolDelegate = artifacts.require('RocketMinipoolDelegate');
export const RocketDAOProtocolSettingsMinipool = artifacts.require('RocketDAOProtocolSettingsMinipool');
export const LinkedListStorage = artifacts.require('LinkedListStorageHelper');
export const RocketDepositPool = artifacts.require('RocketDepositPool');
export const RocketMinipoolBondReducer = artifacts.require('RocketMinipoolBondReducer');
export const RocketNetworkSnapshots = artifacts.require('RocketNetworkSnapshots');
export const RocketNetworkVoting = artifacts.require('RocketNetworkVoting');
export const RocketUpgradeOneDotThreeDotOne = artifacts.require('RocketUpgradeOneDotThreeDotOne');
export const MegapoolUpgradeHelper = artifacts.require('MegapoolUpgradeHelper');
