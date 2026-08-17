import {
    RocketDAONodeTrusted,
    RocketDAONodeTrustedActions,
    RocketDAONodeTrustedSettingsMembers,
    RocketDAOProtocolSettingsProposals,
    RocketDAOProtocolSettingsSecurity,
    RocketDAOProtocolVerifier,
} from '../_utils/artifacts';
import { approveRPL, mintRPL } from './tokens';

export async function mintRPLBond(owner, node) {
    // Load contracts
    const [
        rocketDAONodeTrustedActions,
        rocketDAONodeTrustedSettings,
    ] = await Promise.all([
        RocketDAONodeTrustedActions.deployed(),
        RocketDAONodeTrustedSettingsMembers.deployed(),
    ]);

    // Get RPL bond amount
    const bondAmount = await rocketDAONodeTrustedSettings.getRPLBond.call();

    // Mint RPL amount and approve DAO node contract to spend
    await mintRPL(owner, node, bondAmount);
    await approveRPL(rocketDAONodeTrustedActions.address, bondAmount, { from: node });
}

export async function bootstrapMember(address, id, url, txOptions) {
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    await rocketDAONodeTrusted.bootstrapMember(id, url, address, txOptions);
}

export async function memberJoin(txOptions) {
    const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed();
    await rocketDAONodeTrustedActions.actionJoin(txOptions);
}

export async function getDaoProtocolChallenge(proposalID, challengeID) {
    // Load contracts
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    return rocketDAOProtocolVerifier.getChallenge(proposalID, challengeID);
}

export async function getDaoProtocolVotePhase1Time() {
    // Load contracts
    const rocketDAOProtocolSettingsProposals = await RocketDAOProtocolSettingsProposals.deployed();
    return Number(await rocketDAOProtocolSettingsProposals.getVotePhase1Time());
}

export async function getDaoProtocolVotePhase2Time() {
    // Load contracts
    const rocketDAOProtocolSettingsProposals = await RocketDAOProtocolSettingsProposals.deployed();
    return Number(await rocketDAOProtocolSettingsProposals.getVotePhase2Time());
}

export async function getDaoProtocolVoteDelayTime() {
    // Load contracts
    const rocketDAOProtocolSettingsProposals = await RocketDAOProtocolSettingsProposals.deployed();
    return Number(await rocketDAOProtocolSettingsProposals.getVoteDelayTime());
}

export async function getDaoProtocolSecurityLeaveTime() {
    // Load contracts
    const rocketDAOProtocolSettingsSecurity = await RocketDAOProtocolSettingsSecurity.deployed();
    return Number(await rocketDAOProtocolSettingsSecurity.getLeaveTime());
}

export async function getDaoProtocolDepthPerRound() {
    // Load contracts
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    return Number(await rocketDAOProtocolVerifier.getDepthPerRound());
}

export async function getDaoProtocolChallengeBond() {
    // Load contracts
    const rocketDAOProtocolSettingsProposals = await RocketDAOProtocolSettingsProposals.deployed();
    return await rocketDAOProtocolSettingsProposals.getChallengeBond();
}

export async function getDaoProtocolProposalBond() {
    // Load contracts
    const rocketDAOProtocolSettingsProposals = await RocketDAOProtocolSettingsProposals.deployed();
    return await rocketDAOProtocolSettingsProposals.getProposalBond();
}

export async function getDaoProtocolChallengePeriod() {
    // Load contracts
    const rocketDAOProtocolSettingsProposals = await RocketDAOProtocolSettingsProposals.deployed();
    return Number(await rocketDAOProtocolSettingsProposals.getChallengePeriod());
}
