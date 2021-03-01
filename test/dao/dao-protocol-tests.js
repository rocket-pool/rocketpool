import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { setDAOProtocolBootstrapSetting, setDaoProtocolBootstrapModeDisabled } from './scenario-dao-protocol-bootstrap';

// Contracts
import { RocketDAOProtocolSettingsAuction, RocketDAOProtocolSettingsDeposit, RocketDAOProtocolSettingsInflation, RocketDAOProtocolSettingsMinipool, RocketDAOProtocolSettingsNetwork, RocketDAOProtocolSettingsRewards } from '../_utils/artifacts'; 


export default function() {
    contract('RocketDAOProtocol', async (accounts) => {

        // Accounts
        const [
            guardian,
            userOne,
            swcDummyAddress
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup - This is a WIP DAO, onlyGuardians will be able to change settings before the DAO is officially rolled out
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
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.withdrawal.contract.address', swcDummyAddress, {
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