import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { mintDummyRPL } from '../token/scenario-rpl-mint-fixed';
import { burnFixedRPL } from '../token/scenario-rpl-burn-fixed';
import { allowDummyRPL } from '../token/scenario-rpl-allow-fixed';
import { setDAOProtocolBootstrapSetting, setDaoProtocolBootstrapModeDisabled } from './scenario-dao-protocol-bootstrap';
import { proposalStates, getDAOProposalState, getDAOProposalStartBlock, getDAOProposalEndBlock} from './scenario-dao-proposal';

// Contracts
import { RocketDAOProtocolSettingsAuction, RocketDAOProtocolSettingsDeposit, RocketDAOProtocolSettingsInflation, RocketDAOProtocolSettingsMinipool, RocketDAOProtocolSettingsNetwork, RocketDAOProtocolSettingsRewards } from '../_utils/artifacts'; 


export default function() {
    contract('RocketDAOProtocol', async (accounts) => {


        // Accounts
        const [
            guardian,
            userOne,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


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

        // Add a new DAO member via bootstrap mode
        let bootstrapMemberAdd = async function(_account, _id, _email) {
            // Use helper now
            await setNodeTrusted(_account, _id, _email, owner);
        }


        // Setup
        before(async () => {
        
        });


        //
        // Start Tests
        //

        // Update a setting
        it(printTitle('userOne', 'fails to update a setting as they are not the guardian'), async () => {
            // Fails to change a setting
            await shouldRevert(setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: userOne,
            }), "User updated bootstrap setting", "Account is not a temporary guardian");
            
        });
        
        // Verify each setting contract is enabled correctly. These settings are tested in greater detail in the relevent contracts
        it(printTitle('guardian', 'updates a setting in each settings contract while bootstrap mode is enabled'), async () => {
            // Set via bootstrapping
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: guardian
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.minimum', web3.utils.toWei('2'), {
                from: guardian
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsInflation, 'rpl.inflation.interval.blocks', 400, {
                from: guardian
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.submit.withdrawable.enabled', true, {
                from: guardian
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.submit.prices.enabled', true, {
                from: guardian
            });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rpl.rewards.claim.period.blocks', 100, {
                from: guardian
            });
        });

        // Update a setting, then try again
        it(printTitle('guardian', 'updates a setting, then fails to update a setting again after bootstrap mode is disabled'), async () => {
            // Set via bootstrapping
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: guardian
            });
            // Disable bootstrap mode
            await setDaoProtocolBootstrapModeDisabled({
                from: guardian
            });
            // Attempt to change a setting again
            await shouldRevert(setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
                from: guardian,
            }), "Guardian updated bootstrap setting after mode disabled", "Bootstrap mode not engaged");
            
        });
        


        

    });
}
