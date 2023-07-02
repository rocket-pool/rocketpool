import {
    RocketDAONodeTrusted,
    RocketDAONodeTrustedActions,
    RocketDAONodeTrustedSettingsMembers,
    RocketDAOProtocolVerifier,
} from '../_utils/artifacts';
import { mintRPL, approveRPL } from './tokens';


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
    await approveRPL(rocketDAONodeTrustedActions.address, bondAmount, {from: node});

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
export async function getDaoProtocolDepthPerRound() {
    // Load contracts
    const rocketDAOProtocolVerifier = await RocketDAOProtocolVerifier.deployed();
    return Number(await rocketDAOProtocolVerifier.getDepthPerRound());
}
