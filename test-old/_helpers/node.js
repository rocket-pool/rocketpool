import {
    RocketDAONodeTrusted,
    RocketDAONodeTrustedActions,
    RocketDAONodeTrustedSettingsMembers,
    RocketMinipoolFactory,
    RocketNetworkVoting,
    RocketNodeDeposit,
    RocketNodeManager,
    RocketNodeStaking,
    RocketStorage,
    RocketTokenRPL,
} from '../_utils/artifacts';
import { setDaoNodeTrustedBootstrapMember } from '../dao/scenario-dao-node-trusted-bootstrap';
import { daoNodeTrustedMemberJoin } from '../dao/scenario-dao-node-trusted';
import { mintDummyRPL } from '../token/scenario-rpl-mint-fixed';
import { burnFixedRPL } from '../token/scenario-rpl-burn-fixed';
import { allowDummyRPL } from '../token/scenario-rpl-allow-fixed';
import { getDepositDataRoot, getValidatorPubkey, getValidatorSignature } from '../_utils/beacon';
import { assertBN } from './bn';
import * as assert from 'assert';

// Get a node's RPL stake
export async function getNodeStakedRPL(nodeAddress) {
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    return rocketNodeStaking.getNodeStakedRPL(nodeAddress);
}

// Get a node's effective RPL stake
export async function getNodeEffectiveRPLStake(nodeAddress) {
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    return rocketNodeStaking.getNodeEffectiveRPLStake(nodeAddress);
}

// Get a node's minipool RPL stake
export async function getNodeMinimumRPLStake(nodeAddress) {
    const rocketNodeStaking = await RocketNodeStaking.deployed();
    return rocketNodeStaking.getNodeMinimumRPLStake(nodeAddress);
}

// Register a node
export async function registerNode(txOptions) {
    const rocketNodeManager = (await RocketNodeManager.deployed());
    await rocketNodeManager.connect(txOptions.from).registerNode('Australia/Brisbane');
}

// Get number of nodes
export async function getNodeCount() {
    const rocketNodeManager = await RocketNodeManager.deployed();
    return rocketNodeManager.getNodeCount();
}

// Make a node a trusted dao member, only works in bootstrap mode (< 3 trusted dao members)
export async function setNodeTrusted(_account, _id, _url, owner) {
    // Mints fixed supply RPL, burns that for new RPL and gives it to the account
    let rplMint = async function(_account, _amount) {
        // Load contracts
        const rocketTokenRPL = await RocketTokenRPL.deployed();
        // Mint RPL fixed supply for the users to simulate current users having RPL
        await mintDummyRPL(_account, _amount, { from: owner });
        // Mint a large amount of dummy RPL to owner, who then burns it for real RPL which is sent to nodes for testing below
        await allowDummyRPL(rocketTokenRPL.target, _amount, { from: _account });
        // Burn existing fixed supply RPL for new RPL
        await burnFixedRPL(_amount, { from: _account });
    };

    // Allow the given account to spend this users RPL
    let rplAllowanceDAO = async function(_account, _amount) {
        // Load contracts
        const rocketTokenRPL = await RocketTokenRPL.deployed();
        const rocketDAONodeTrustedActions = await RocketDAONodeTrustedActions.deployed();
        // Approve now
        await rocketTokenRPL.connect(_account).approve(rocketDAONodeTrustedActions.target, _amount, { from: _account });
    };

    // Get the DAO settings
    let daoNodesettings = await RocketDAONodeTrustedSettingsMembers.deployed();
    // How much RPL is required for a trusted node bond?
    let rplBondAmount = await daoNodesettings.getRPLBond();
    // Mint RPL bond required for them to join
    await rplMint(_account, rplBondAmount);
    // Set allowance for the Vault to grab the bond
    await rplAllowanceDAO(_account, rplBondAmount);
    // Create invites for them to become a member
    await setDaoNodeTrustedBootstrapMember(_id, _url, _account, { from: owner });
    // Now get them to join
    await daoNodeTrustedMemberJoin({ from: _account });
    // Check registration was successful and details are correct
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();
    const id = await rocketDAONodeTrusted.getMemberID(_account);
    assert.equal(id, _id, 'Member ID is wrong');
    const url = await rocketDAONodeTrusted.getMemberUrl(_account);
    assert.equal(url, _url, 'Member URL is wrong');
    const joinedTime = await rocketDAONodeTrusted.getMemberJoinedTime(_account);
    assert.notEqual(joinedTime, 0n, 'Member joined time is wrong');
    const valid = await rocketDAONodeTrusted.getMemberIsValid(_account);
    assert.equal(valid, true, 'Member valid flag is not set');
}

// Set a withdrawal address for a node
export async function setNodeWithdrawalAddress(nodeAddress, withdrawalAddress, txOptions) {
    const rocketStorage = await RocketStorage.deployed();
    await rocketStorage.connect(txOptions.from).setWithdrawalAddress(nodeAddress, withdrawalAddress, true, txOptions);
}

// Set an RPL withdrawal address for a node
export async function setNodeRPLWithdrawalAddress(nodeAddress, rplWithdrawalAddress, txOptions) {
    const rocketNodeManager = await RocketNodeManager.deployed();
    await rocketNodeManager.connect(txOptions.from).setRPLWithdrawalAddress(nodeAddress, rplWithdrawalAddress, true, txOptions);
}

// Submit a node RPL stake
export async function nodeStakeRPL(amount, txOptions) {
    const [rocketNodeStaking, rocketTokenRPL] = await Promise.all([
        RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
    ]);
    await rocketTokenRPL.connect(txOptions.from).approve(rocketNodeStaking.target, amount);
    const before = await rocketNodeStaking.getNodeStakedRPL(txOptions.from);
    await rocketNodeStaking.connect(txOptions.from).stakeRPL(amount);
    const after = await rocketNodeStaking.getNodeStakedRPL(txOptions.from);
    assertBN.equal(after - before, amount, 'Staking balance did not increase by amount staked');
}

// Delegate voting power
export async function nodeSetDelegate(to, txOptions) {
    const rocketNetworkVoting = (await RocketNetworkVoting.deployed()).connect(txOptions.from);
    await rocketNetworkVoting.setDelegate(to, txOptions);
    const newDelegate = await rocketNetworkVoting.getCurrentDelegate(txOptions.from);
    assert.equal(newDelegate, to);
}

// Submit a node RPL stake on behalf of another node
export async function nodeStakeRPLFor(nodeAddress, amount, txOptions) {
    const [rocketNodeStaking, rocketTokenRPL] = await Promise.all([
        RocketNodeStaking.deployed(),
        RocketTokenRPL.deployed(),
    ]);
    await rocketTokenRPL.connect(txOptions.from).approve(rocketNodeStaking.target, amount, txOptions);
    const before = await rocketNodeStaking.getNodeMegapoolStakedRPL(nodeAddress);
    await rocketNodeStaking.connect(txOptions.from).stakeRPLFor(nodeAddress, amount, txOptions);
    const after = await rocketNodeStaking.getNodeMegapoolStakedRPL(nodeAddress);
    assertBN.equal(after - before, amount, 'Staking balance did not increase by amount staked');
}

// Deposits ETH into a node operator's balance
export async function nodeDepositEthFor(nodeAddress, txOptions) {
    const [rocketNodeDeposit] = await Promise.all([
        RocketNodeDeposit.deployed(),
    ]);
    const before = await rocketNodeDeposit.getNodeEthBalance(nodeAddress);
    await rocketNodeDeposit.connect(txOptions.from).depositEthFor(nodeAddress, txOptions);
    const after = await rocketNodeDeposit.getNodeEthBalance(nodeAddress);
    assertBN.equal(after - before, txOptions.value, 'ETH balance did not increase by msg.value');
}

// Sets allow state for staking on behalf
export async function setStakeRPLForAllowed(caller, state, txOptions) {
    const [rocketNodeStaking] = await Promise.all([
        RocketNodeStaking.deployed(),
    ]);
    await rocketNodeStaking.connect(txOptions.from)['setStakeRPLForAllowed(address,bool)'](caller, state, txOptions);
}

// Sets allow state for staking on behalf
export async function setStakeRPLForAllowedWithNodeAddress(nodeAddress, caller, state, txOptions) {
    const rocketNodeStaking = (await RocketNodeStaking.deployed()).connect(txOptions.from);
    await rocketNodeStaking['setStakeRPLForAllowed(address,address,bool)'](nodeAddress, caller, state, txOptions);
}

// Withdraw a node RPL stake
export async function nodeWithdrawRPL(amount, txOptions) {
    const rocketNodeStaking = (await RocketNodeStaking.deployed()).connect(txOptions.from);
    await rocketNodeStaking['withdrawRPL(uint256)'](amount, txOptions);
}

// Set allow state for RPL locking
export async function setRPLLockingAllowed(node, state, txOptions) {
    const rocketNodeStaking = (await RocketNodeStaking.deployed()).connect(txOptions.from);
    await rocketNodeStaking.connect(txOptions.from).setRPLLockingAllowed(node, state);
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
        RocketStorage.deployed(),
    ]);

    const salt = minipoolSalt++;
    const minipoolAddress = (await rocketMinipoolFactory.getExpectedAddress(txOptions.from.address, salt)).substr(2);
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
    await rocketNodeDeposit.connect(txOptions.from).deposit(txOptions.value, '0'.ether, depositData.pubkey, depositData.signature, depositDataRoot, salt, '0x' + minipoolAddress, txOptions);
}

// Get a node's deposit credit balance
export async function getNodeDepositCredit(nodeAddress) {
    const rocketNodeDeposit = (await RocketNodeDeposit.deployed());
    return rocketNodeDeposit.getNodeDepositCredit(nodeAddress);
}

// Get a node's effective RPL stake
export async function getNodeAverageFee(nodeAddress) {
    const rocketNodeManager = (await RocketNodeManager.deployed());
    return rocketNodeManager.getAverageNodeFee(nodeAddress);
}
