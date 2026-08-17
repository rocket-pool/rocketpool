import type {
    ProtocolContext,
    ProtocolCurrent,
    ProtocolV131,
    ProtocolV14,
} from "./harness";
import type { RocketNodeDeposit as CurrentRocketNodeDeposit } from "./harness/bindings/current";
import type { RocketNodeDeposit as V14RocketNodeDeposit } from "./harness/bindings/v1_4";

declare const rp131: ProtocolV131;
declare const rp14: ProtocolV14;
declare const current: ProtocolCurrent;
declare const ctx: ProtocolContext;

rp131.minipools.create;
rp131.minipools.delegate;
rp14.minipools.stake;
const v14NodeDeposit: V14RocketNodeDeposit = rp14.contracts.rocketNodeDeposit;
const currentNodeDeposit: CurrentRocketNodeDeposit = current.contracts.rocketNodeDeposit;
void v14NodeDeposit;
void currentNodeDeposit;

// Current protocol minipool creation is deliberately unavailable.
// @ts-expect-error
current.minipools.create;

current.nodes.register;
current.nodes.setWithdrawalAddress;
current.nodes.setRplWithdrawalAddress;
current.nodes.setStakeRplForAllowed;
current.nodes.setRplLockingAllowed;
current.nodes.stakeRplFor;
current.nodes.unstakeRpl;
current.nodes.unstakeLegacyRpl;
current.nodes.withdrawRpl;
current.nodes.unstakingRpl;
current.nodes.lockedRpl;
current.nodes.initialiseFeeDistributor;
current.distributors.distribute;
current.tokens.transferReth;
current.tokens.burnReth;
current.tokens.depositExcessRethCollateral;
current.tokens.rethCollateralRate;
current.tokens.rethContractBalance;
current.tokens.mintFixedSupplyRpl;
current.tokens.approveFixedSupplyRpl;
current.tokens.swapFixedSupplyRpl;
current.tokens.mintRplInflation;
current.tokens.rplSupply;
current.auctions.fundRpl;
current.auctions.createLot;
current.auctions.placeBid;
current.auctions.claimBid;
current.auctions.recoverUnclaimedRpl;
current.auctions.lot;
current.auctions.bid;
current.auctions.priceAtBlock;
current.depositPool.excessBalance;
current.pdao.settings.deposits.setFee;
current.pdao.settings.inflation.setStartTime;
current.pdao.settings.inflation.setIntervalRate;
current.pdao.settings.auctions.setLotDuration;
current.pdao.settings.auctions.setLotCreationEnabled;
current.pdao.settings.nodes.setWithdrawalCooldown;
current.time.latest;
current.time.advanceRplUnstakingPeriod;
current.time.advanceRplWithdrawalCooldown;
current.time.mineBlocks;
current.time.advanceMinipoolUserDistributeStart;
current.time.advanceMinipoolUserDistributeWindow;
current.minipools.forNode;
current.minipools.details;
current.minipools.voteScrub;
current.minipools.beginUserDistribute;
current.minipools.distributeBalance;
current.minipools.slash;
current.minipools.setMaximumPenaltyRate;
current.minipools.maximumPenaltyRate;
current.minipools.penaltyRate;

// Delegate versions are live protocol state, not cached entity metadata.
// @ts-expect-error
rp131.minipools.get("pool").delegateVersion;
rp131.pdao.settings.nodes.setRegistrationEnabled;
rp131.pdao.settings.minipools.setLaunchTimeout;
rp131.pdao.settings.minipools.setUserDistributeWindowStart;
rp131.pdao.settings.minipools.setUserDistributeWindowLength;
rp131.pdao.settings.network.setRethCollateralTarget;
rp131.pdao.settings.network.setNodeFeeRange;
rp131.odao.settings.minipools.getScrubPeriod;
rp131.odao.members.bootstrap;
current.pdao.settings.nodes.setRegistrationEnabled;
current.pdao.treasury.createRecurringPayment;
current.pdao.treasury.updateRecurringPayment;
current.pdao.treasury.payment;
current.pdao.treasury.recipientBalance;
current.pdao.treasury.treasuryBalance;
current.pdao.treasury.fund;
current.pdao.treasury.payOut;
current.pdao.treasury.withdraw;
current.pdao.security.members.invite;
current.pdao.security.members.join;
current.pdao.security.members.requestLeave;
current.pdao.security.members.leave;
current.pdao.security.proposals.propose;
current.pdao.security.proposals.vote;
current.pdao.security.proposals.execute;
current.pdao.security.upgrades.proposeVeto;
current.pdao.security.upgrades.vote;
current.pdao.security.upgrades.execute;
current.pdao.settings.security.setUpgradeDelay;
current.odao.upgrades.execute;
current.odao.upgrades.details;
current.odao.bootstrap.disable;
current.odao.bootstrap.upgrade;
current.odao.members.bootstrapInvite;
current.odao.members.prepareBond;
current.odao.members.join;
current.odao.members.joinRequired;
current.odao.challenges.make;
current.odao.challenges.decide;
current.odao.proposals.cancel;
current.odao.settings.members.setQuorum;
current.pdao.settings.nodes.setReducedBond;
current.pdao.settings.megapools.setDissolvePenalty;
current.pdao.bootstrap.enableGovernance;
current.pdao.bootstrap.disable;
current.pdao.bootstrap.setSetting;
current.pdao.bootstrap.setSettings;
current.pdao.bootstrap.setAddressList;
current.pdao.governance.proposals.propose;
current.pdao.governance.proposals.vote;
current.pdao.governance.proposals.overrideVote;
current.pdao.governance.proposals.execute;
current.pdao.governance.proposals.finalise;
current.pdao.governance.verifier.createChallenge;
current.pdao.governance.verifier.submitRoot;
current.pdao.governance.verifier.defeat;
current.pdao.governance.verifier.claimProposer;
current.pdao.governance.verifier.claimChallenger;
current.pdao.settings.proposals.voteDelay;
current.pdao.settings.network.setNodeShareSecurityCouncilAdder;
current.pdao.settings.network.setNodeShare;
current.pdao.settings.network.setVoterShare;
current.network.voting.setDelegate;
current.network.voting.nodeCount;
current.network.revenues.shares;

// Upgrade veto APIs did not exist in v1.3.1.
// @ts-expect-error
rp131.pdao.security.upgrades;
// @ts-expect-error
rp131.odao.upgrades;
current.pdao.settings.rewards.setClaimInterval;
current.pdao.settings.rewards.setClaimers;
current.pdao.settings.rewards.claimers;
current.rewards.submit;
current.rewards.execute;
current.rewards.claim;
current.rewards.claimAndStake;
current.rewards.claimedBitmap;
rp14.rewards.submit;
current.odao.settings.minipools.getScrubPeriod;
current.odao.settings.minipools.setScrubPenaltyEnabled;
current.contracts.rocketDAOProtocolSettingsMegapool.getExitDeficit;
ctx.fixtures.revertingReceiver.deploy;
ctx.fixtures.revertingReceiver.get;
ctx.fixtures.rplStakeController.deploy;
ctx.fixtures.rplStakeController.get;
ctx.fixtures.minipoolPenaltyController.deploy;
ctx.fixtures.minipoolPenaltyController.get;

// DAO settings must identify their owning DAO.
// @ts-expect-error
current.settings;

// Test fixtures belong to the harness context, not a protocol release.
// @ts-expect-error
current.testHelpers;

// Upgrade targets are constrained by the generated release graph.
// @ts-expect-error
rp14.upgradeTo("1.3.1");
