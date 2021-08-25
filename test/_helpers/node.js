import {
    RocketNodeDeposit,
    RocketNodeManager,
    RocketNodeStaking,
    RocketTokenRPL,
    RocketDAONodeTrustedActions,
    RocketDAONodeTrustedSettingsMembers,
    RocketStorage, RocketDAONodeTrusted
} from '../_utils/artifacts'
import { setDaoNodeTrustedBootstrapMember } from '../dao/scenario-dao-node-trusted-bootstrap';
import { daoNodeTrustedMemberJoin } from '../dao/scenario-dao-node-trusted';
import { mintDummyRPL } from '../token/scenario-rpl-mint-fixed';
import { burnFixedRPL } from '../token/scenario-rpl-burn-fixed';
import { allowDummyRPL } from '../token/scenario-rpl-allow-fixed';


// Get a node's RPL stake
export async function getNodeRPLStake(nodeAddress) {
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    let stake = await rocketNodeStaking.getNodeRPLStake.call(nodeAddress);
    return stake;
}


// Get a node's effective RPL stake
export async function getNodeEffectiveRPLStake(nodeAddress) {
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    let effectiveStake = await rocketNodeStaking.getNodeEffectiveRPLStake.call(nodeAddress);
    return effectiveStake;
}


// Get a node's minipool RPL stake
export async function getNodeMinimumRPLStake(nodeAddress) {
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    let minimumStake = await rocketNodeStaking.getNodeMinimumRPLStake.call(nodeAddress);
    return minimumStake;
}


// Get total effective RPL stake
export async function getTotalEffectiveRPLStake() {
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    let totalStake = await rocketNodeStaking.getTotalEffectiveRPLStake.call();
    return totalStake;
}


// Get calculated effective RPL stake
export async function getCalculatedTotalEffectiveRPLStake(price) {
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    let totalStake = await rocketNodeStaking.calculateTotalEffectiveRPLStake.call(0, 0, price);
    return totalStake;
}


// Register a node
export async function registerNode(txOptions) {
    const rocketNodeManager = await RocketNodeManager.deployed();
    await rocketNodeManager.registerNode('Australia/Brisbane', txOptions);
}


// Make a node a trusted dao member, only works in bootstrap mode (< 3 trusted dao members)
export async function setNodeTrusted(_account, _id, _url, owner) {
    // Mints fixed supply RPL, burns that for new RPL and gives it to the account
    let rplMint = async function(_account, _amount) {
        // Load contracts
        const rocketTokenRPL = await RocketTokenRPL.deployed();
        // Convert
        _amount = web3.utils.toWei(_amount.toString(), 'ether');
        // Mint RPL fixed supply for the users to simulate current users having RPL
        await mintDummyRPL(_account, _amount, { from: owner });
        // Mint a large amount of dummy RPL to owner, who then burns it for real RPL which is sent to nodes for testing below
        await allowDummyRPL(rocketTokenRPL.address, _amount, { from: _account });
        // Burn existing fixed supply RPL for new RPL
        await burnFixedRPL(_amount, { from: _account }); 
    }
    
    // Allow the given account to spend this users RPL
    let rplAllowanceDAO = async function(_account, _amount) {
        // Load contracts
        const rocketTokenRPL = await RocketTokenRPL.deployed();
        const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed();
        // Convert
        _amount = web3.utils.toWei(_amount.toString(), 'ether');
        // Approve now
        await rocketTokenRPL.approve(rocketDAONodeTrustedActions.address, _amount, { from: _account });
    }

    // Get the DAO settings
    let daoNodesettings = await RocketDAONodeTrustedSettingsMembers.deployed();
    // How much RPL is required for a trusted node bond?
    let rplBondAmount = web3.utils.fromWei(await daoNodesettings.getRPLBond());
    // Mint RPL bond required for them to join
    await rplMint(_account, rplBondAmount);
    // Set allowance for the Vault to grab the bond
    await rplAllowanceDAO(_account, rplBondAmount);
    // Create invites for them to become a member
    await setDaoNodeTrustedBootstrapMember(_id, _url, _account, {from: owner});
    // Now get them to join
    await daoNodeTrustedMemberJoin({from: _account});
    // Check registration was successful and details are correct
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const id = await rocketDAONodeTrusted.getMemberID(_account);
    assert(id === _id, "Member ID is wrong");
    const url = await rocketDAONodeTrusted.getMemberUrl(_account);
    assert(url === _url, "Member URL is wrong");
    const joinedTime = await rocketDAONodeTrusted.getMemberJoinedTime(_account);
    assert(!joinedTime.eq(0), "Member joined time is wrong");
    const valid = await rocketDAONodeTrusted.getMemberIsValid(_account);
    assert(valid, "Member valid flag is not set");
}


// Set a withdrawal address for a node
export async function setNodeWithdrawalAddress(nodeAddress, withdrawalAddress, txOptions) {
    const rocketStorage = await RocketStorage.deployed();
    await rocketStorage.setWithdrawalAddress(nodeAddress, withdrawalAddress, true, txOptions);
}


// Submit a node RPL stake
export async function nodeStakeRPL(amount, txOptions) {
    const [rocketNodeStaking, rocketTokenRPL] = await Promise.all([
        RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
    ]);
    await rocketTokenRPL.approve(rocketNodeStaking.address, amount, txOptions);
    const before = await rocketNodeStaking.getNodeRPLStake(txOptions.from)
    await rocketNodeStaking.stakeRPL(amount, txOptions);
    const after = await rocketNodeStaking.getNodeRPLStake(txOptions.from)
    assert(after.sub(before).eq(amount), 'Staking balance did not increase by amount staked')
}


// Withdraw a node RPL stake
export async function nodeWithdrawRPL(amount, txOptions) {
    const rocketNodeStaking= await RocketNodeStaking.deployed();
    await rocketNodeStaking.withdrawRPL(amount, txOptions);
}


// Make a node deposit
export async function nodeDeposit(txOptions) {
    const rocketNodeDeposit = await RocketNodeDeposit.deployed();
    await rocketNodeDeposit.deposit(web3.utils.toWei('0', 'ether'), txOptions);
}

