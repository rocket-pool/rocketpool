import {
    RocketNodeDeposit,
    RocketNodeManager,
    RocketNodeStaking,
    RocketTokenRPL,
    RocketDAONodeTrustedActions,
    RocketDAONodeTrustedSettingsMembers,
    RocketStorage,
    RocketDAONodeTrusted,
    RocketMinipoolFactory,
    RocketNetworkVoting,
    RocketDAOProtocolNew,
    RocketDAOProtocol,
    RocketNodeManagerNew,
    RocketNodeStakingNew,
} from '../_utils/artifacts';
import { setDaoNodeTrustedBootstrapMember } from '../dao/scenario-dao-node-trusted-bootstrap';
import { daoNodeTrustedMemberJoin } from '../dao/scenario-dao-node-trusted';
import { mintDummyRPL } from '../token/scenario-rpl-mint-fixed';
import { burnFixedRPL } from '../token/scenario-rpl-burn-fixed';
import { allowDummyRPL } from '../token/scenario-rpl-allow-fixed';
import { getDepositDataRoot, getValidatorPubkey, getValidatorSignature } from '../_utils/beacon';
import { assertBN } from './bn';
import { upgradeExecuted } from '../_utils/upgrade';


// Get a node's RPL stake
export async function getNodeRPLStake(nodeAddress) {
    const rocketNodeStaking = (await upgradeExecuted()) ? await RocketNodeStakingNew.deployed() : await RocketNodeStaking.deployed();
    let stake = await rocketNodeStaking.getNodeRPLStake.call(nodeAddress);
    return stake;
}


// Get a node's effective RPL stake
export async function getNodeEffectiveRPLStake(nodeAddress) {
    const rocketNodeStaking = (await upgradeExecuted()) ? await RocketNodeStakingNew.deployed() : await RocketNodeStaking.deployed();
    let effectiveStake = await rocketNodeStaking.getNodeEffectiveRPLStake.call(nodeAddress);
    return effectiveStake;
}


// Get a node's minipool RPL stake
export async function getNodeMinimumRPLStake(nodeAddress) {
    const rocketNodeStaking = (await upgradeExecuted()) ? await RocketNodeStakingNew.deployed() : await RocketNodeStaking.deployed();
    let minimumStake = await rocketNodeStaking.getNodeMinimumRPLStake.call(nodeAddress);
    return minimumStake;
}


// Register a node
export async function registerNode(txOptions) {
    const rocketNodeManager = (await upgradeExecuted()) ? await RocketNodeManagerNew.deployed() : await RocketNodeManager.deployed();
    await rocketNodeManager.registerNode('Australia/Brisbane', txOptions);
}

// Get number of nodes
export async function getNodeCount(txOptions) {
    const rocketNodeManager = (await upgradeExecuted()) ? await RocketNodeManagerNew.deployed() : await RocketNodeManager.deployed();
    return rocketNodeManager.getNodeCount(txOptions);
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
        const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed()
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
        (await upgradeExecuted()) ? RocketNodeStakingNew.deployed() : await RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
    ]);
    await rocketTokenRPL.approve(rocketNodeStaking.address, amount, txOptions);
    const before = await rocketNodeStaking.getNodeRPLStake(txOptions.from);
    await rocketNodeStaking.stakeRPL(amount, txOptions);
    const after = await rocketNodeStaking.getNodeRPLStake(txOptions.from);
    assertBN.equal(after.sub(before), amount, 'Staking balance did not increase by amount staked');
}


// Delegate voting power
export async function nodeSetDelegate(to, txOptions) {
    const rocketNetworkVoting = await RocketNetworkVoting.deployed();
    await rocketNetworkVoting.setDelegate(to, txOptions);
    const newDelegate = await rocketNetworkVoting.getCurrentDelegate(txOptions.from);
    assert.equal(newDelegate, to);
}

// Submit a node RPL stake on behalf of another node
export async function nodeStakeRPLFor(nodeAddress, amount, txOptions) {
    const [rocketNodeStaking, rocketTokenRPL] = await Promise.all([
        (await upgradeExecuted()) ? RocketNodeStakingNew.deployed() : await RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
    ]);
    await rocketTokenRPL.approve(rocketNodeStaking.address, amount, txOptions);
    const before = await rocketNodeStaking.getNodeRPLStake(nodeAddress);
    await rocketNodeStaking.stakeRPLFor(nodeAddress, amount, txOptions);
    const after = await rocketNodeStaking.getNodeRPLStake(nodeAddress);
    assertBN.equal(after.sub(before), amount, 'Staking balance did not increase by amount staked');
}


// Sets allow state for staking on behalf
export async function setStakeRPLForAllowed(caller, state, txOptions) {
    const [rocketNodeStaking] = await Promise.all([
        (await upgradeExecuted()) ? RocketNodeStakingNew.deployed() : await RocketNodeStaking.deployed(),
    ]);
    await rocketNodeStaking.setStakeRPLForAllowed(caller, state, txOptions);
}


// Withdraw a node RPL stake
export async function nodeWithdrawRPL(amount, txOptions) {
    const rocketNodeStaking = (await upgradeExecuted()) ? await RocketNodeStakingNew.deployed() : await RocketNodeStaking.deployed();
    await rocketNodeStaking.methods['withdrawRPL(uint256)'](amount, txOptions);
}


// Make a node deposit
let minipoolSalt = 0;
export async function nodeDeposit(txOptions) {

    // Load contracts
    const [
        rocketMinipoolFactory,
        rocketNodeDeposit,
        rocketStorage,
    ] = await Promise.all([
        RocketMinipoolFactory.deployed(),
        RocketNodeDeposit.deployed(),
        RocketStorage.deployed()
    ]);

    const salt = minipoolSalt++;
    const minipoolAddress = (await rocketMinipoolFactory.getExpectedAddress(txOptions.from, salt)).substr(2);
    let withdrawalCredentials = '0x010000000000000000000000' + minipoolAddress;

    // Get validator deposit data
    let depositData = {
        pubkey: getValidatorPubkey(),
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(1000000000), // 1 ETH in gwei
        signature: getValidatorSignature(),
    };

    let depositDataRoot = getDepositDataRoot(depositData);

    // Make node deposit
    await rocketNodeDeposit.deposit(txOptions.value, '0'.ether, depositData.pubkey, depositData.signature, depositDataRoot, salt, '0x' + minipoolAddress, txOptions);
}


// Get a node's deposit credit balance
export async function getNodeDepositCredit(nodeAddress) {
    const rocketNodeDeposit = await RocketNodeDeposit.deployed();
    let credit = await rocketNodeDeposit.getNodeDepositCredit(nodeAddress);
    return credit;
}

// Get a node's effective RPL stake
export async function getNodeAverageFee(nodeAddress) {
    const rocketNodeManager = await RocketNodeManager.deployed();
    let averageFee = await rocketNodeManager.getAverageNodeFee.call(nodeAddress);
    return averageFee;
}
