import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    setDaoProtocolBootstrapModeDisabled, setDAOProtocolBootstrapSecurityInvite,
    setDAOProtocolBootstrapSetting,
    setDAOProtocolBootstrapSettingMulti,
} from './scenario-dao-protocol-bootstrap';

// Contracts
import {
    RocketDAOProtocolSettingsAuction,
    RocketDAOProtocolSettingsDeposit,
    RocketDAOProtocolSettingsInflation,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsProposals,
    RocketDAOProtocolSettingsRewards,
} from '../_utils/artifacts';
import {
    constructPhase1Leaves, daoProtocolCancel,
    daoProtocolClaimBondChallenger,
    daoProtocolClaimBondProposer,
    daoProtocolCreateChallenge,
    daoProtocolDefeatProposal, daoProtocolExecute,
    daoProtocolGeneratePollard,
    daoProtocolPropose,
    daoProtocolSubmitRoot, daoProtocolVote,
    getDelegatedVotingPower,
} from './scenario-dao-protocol';
import { nodeStakeRPL, nodeWithdrawRPL, registerNode } from '../_helpers/node';
import { createMinipool, getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import {
    getDaoProtocolChallengeBond,
    getDaoProtocolChallengePeriod,
    getDaoProtocolDepthPerRound,
    getDaoProtocolProposalBond, getDaoProtocolSecurityLeaveTime,
    getDaoProtocolVoteDelayTime, getDaoProtocolVoteTime,
} from '../_helpers/dao';
import { increaseTime } from '../_utils/evm';
import { assertBN } from '../_helpers/bn';
import { daoNodeTrustedPropose } from './scenario-dao-node-trusted';
import {
    daoSecurityExecute,
    daoSecurityMemberJoin,
    daoSecurityMemberLeave,
    daoSecurityMemberRequestLeave,
    daoSecurityPropose, daoSecurityVote,
} from './scenario-dao-security';
import { getDepositSetting } from '../_helpers/settings';
import { upgradeOneDotThree } from '../_utils/upgrade';

export default function() {
    contract('RocketDAOSecurity', async (accounts) => {

        // Accounts
        const [
            owner,
            securityMember1,
            securityMember2,
            securityMember3,
            random,
        ] = accounts;

        let voteDelayTime;
        let voteTime;
        let leaveTime;

        // Setup
        before(async () => {
            await upgradeOneDotThree();

            await userDeposit({ from: random, value: '320'.ether });

            voteDelayTime = await getDaoProtocolVoteDelayTime();
            voteTime = await getDaoProtocolVoteTime();
            leaveTime = await getDaoProtocolSecurityLeaveTime();
        });

        //
        // Start Tests
        //

        it(printTitle('random', 'can not accept a non-existent invite'), async () => {
            // Accept the invitation
            await shouldRevert(daoSecurityMemberJoin({from: random}), 'Was able to accept invite', 'This address has not been invited to join');
        });


        it(printTitle('security member', 'can accept a valid invite'), async () => {
            // Invite via bootstrap
            await setDAOProtocolBootstrapSecurityInvite("Member 1", securityMember1, {from: owner});
            // Accept the invitation
            await daoSecurityMemberJoin({from: securityMember1});
        });


        it(printTitle('security member', 'can not leave without requesting and waiting required period'), async () => {
            // Invite via bootstrap
            await setDAOProtocolBootstrapSecurityInvite("Member 1", securityMember1, {from: owner});
            // Accept the invitation
            await daoSecurityMemberJoin({from: securityMember1});
            // Try to leave
            await shouldRevert(daoSecurityMemberLeave({from: securityMember1}), 'Was able to leave', 'This member has not been approved to leave or request has expired, please apply to leave again');
        });


        it(printTitle('security member', 'can leave after waiting required period'), async () => {
            // Invite via bootstrap
            await setDAOProtocolBootstrapSecurityInvite("Member 1", securityMember1, { from: owner });
            // Accept the invitation
            await daoSecurityMemberJoin({ from: securityMember1 });
            // Request leave
            await daoSecurityMemberRequestLeave({ from: securityMember1 });
            // Fail to leave
            await shouldRevert(daoSecurityMemberLeave({from: securityMember1}), 'Was able to leave', 'Member has not waited required time to leave');
            // Wait required time
            await increaseTime(hre.web3, leaveTime + 1);
            // Successfully leave
            await daoSecurityMemberLeave({ from: securityMember1 });
        });


        it(printTitle('security member', 'can propose and execute a valid setting change'), async () => {
            // Set up a council of 3 members
            await setDAOProtocolBootstrapSecurityInvite("Member 1", securityMember1, { from: owner });
            await setDAOProtocolBootstrapSecurityInvite("Member 2", securityMember2, { from: owner });
            await setDAOProtocolBootstrapSecurityInvite("Member 3", securityMember3, { from: owner });
            await daoSecurityMemberJoin({ from: securityMember1 });
            await daoSecurityMemberJoin({ from: securityMember2 });
            await daoSecurityMemberJoin({ from: securityMember3 });
            // Raise a proposal to disable deposits
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalSettingBool', type: 'function', inputs: [{type: 'string', name: '_namespace'},{type: 'string', name: '_settingPath'}, {type: 'bool', name: '_value'}]},
                ['deposit', 'deposit.enabled', false]
            );
            // Add the proposal
            let proposalId = await daoSecurityPropose('Disable deposits urgently', proposalCalldata, {
                from: securityMember1
            });
            // Vote in favour
            await daoSecurityVote(proposalId, true, {from: securityMember1});
            await daoSecurityVote(proposalId, true, {from: securityMember2});
            // Execute
            await daoSecurityExecute(proposalId, {from: securityMember2});
            // Check result
            assert(await getDepositSetting('DepositEnabled') === false, 'Deposits were not disabled');
        });


        it(printTitle('security member', 'can not execute a setting change on a non-approved setting path'), async () => {
            // Set up a council of 3 members
            await setDAOProtocolBootstrapSecurityInvite("Member 1", securityMember1, { from: owner });
            await setDAOProtocolBootstrapSecurityInvite("Member 2", securityMember2, { from: owner });
            await setDAOProtocolBootstrapSecurityInvite("Member 3", securityMember3, { from: owner });
            await daoSecurityMemberJoin({ from: securityMember1 });
            await daoSecurityMemberJoin({ from: securityMember2 });
            await daoSecurityMemberJoin({ from: securityMember3 });
            // Raise a proposal to increase deposit pool maximum to 10,000 ether
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalSettingUint', type: 'function', inputs: [{type: 'string', name: '_namespace'},{type: 'string', name: '_settingPath'}, {type: 'uint256', name: '_value'}]},
                ['deposit', 'deposit.pool.maximum', '10000'.ether]
            );
            // Add the proposal
            let proposalId = await daoSecurityPropose('I want more rETH!', proposalCalldata, {
                from: securityMember1
            });
            // Vote in favour
            await daoSecurityVote(proposalId, true, {from: securityMember1});
            await daoSecurityVote(proposalId, true, {from: securityMember2});
            // Execute
            await shouldRevert(daoSecurityExecute(proposalId, {from: securityMember2}), 'Setting was changed', 'Setting is not modifiable by security council');
        });


        it(printTitle('security member', 'can not execute a proposal without quorum'), async () => {
            // Set up a council of 3 members
            await setDAOProtocolBootstrapSecurityInvite("Member 1", securityMember1, { from: owner });
            await setDAOProtocolBootstrapSecurityInvite("Member 2", securityMember2, { from: owner });
            await setDAOProtocolBootstrapSecurityInvite("Member 3", securityMember3, { from: owner });
            await daoSecurityMemberJoin({ from: securityMember1 });
            await daoSecurityMemberJoin({ from: securityMember2 });
            await daoSecurityMemberJoin({ from: securityMember3 });
            // Raise a proposal to disable deposits
            let proposalCalldata = web3.eth.abi.encodeFunctionCall(
                {name: 'proposalSettingBool', type: 'function', inputs: [{type: 'string', name: '_namespace'},{type: 'string', name: '_settingPath'}, {type: 'bool', name: '_value'}]},
                ['deposit', 'deposit.enabled', false]
            );
            // Add the proposal
            let proposalId = await daoSecurityPropose('Disable deposits urgently', proposalCalldata, {
                from: securityMember1
            });
            // Vote in favour
            await daoSecurityVote(proposalId, true, {from: securityMember1});
            // Fail to execute
            await shouldRevert(daoSecurityExecute(proposalId, {from: securityMember2}), 'Proposal was executed', 'Proposal has not succeeded, has expired or has already been executed');
        });
    });
}
