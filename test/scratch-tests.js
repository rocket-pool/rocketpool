import { printTitle } from './_utils/formatting';
import { shouldRevert } from './_utils/testing';
import {
  setDAOProtocolBootstrapSetting,
  setDaoProtocolBootstrapModeDisabled,
  setDAOProtocolBootstrapSettingMulti,
} from './scenario-dao-protocol-bootstrap';

// Contracts
import {
  RocketDAOProtocolSettingsAuction,
  RocketDAOProtocolSettingsDeposit,
  RocketDAOProtocolSettingsInflation,
  RocketDAOProtocolSettingsMinipool,
  RocketDAOProtocolSettingsNetwork,
  RocketDAOProtocolSettingsRewards,
} from '../_utils/artifacts';

export default function() {
  contract('ScratchTests', async accounts => {
    // Accounts
    const [guardian, userOne] = accounts;

    // Setup - This is a WIP DAO, onlyGuardians will be able to change settings before the DAO is officially rolled out
    before(async () => {});

    //
    // Start Tests
    //

    // Verify each setting contract is enabled correctly. These settings are tested in greater detail in the relevant contracts
    it(
      printTitle('guardian', 'updates a setting in each settings contract while bootstrap mode is enabled'),
      async () => {
        // Set via bootstrapping
        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', true, {
          from: guardian,
        });
        await setDAOProtocolBootstrapSetting(
          RocketDAOProtocolSettingsDeposit,
          'deposit.minimum',
          web3.utils.toWei('2'),
          {
            from: guardian,
          }
        );
      }
    );

    // Verify each setting contract is enabled correctly. These settings are tested in greater detail in the relevant contracts
    it(printTitle('guardian', 'updates multiple settings at once while bootstrap mode is enabled'), async () => {
      // Set via bootstrapping
      await setDAOProtocolBootstrapSettingMulti(
        [RocketDAOProtocolSettingsNode],
        ['node.registration.enabled'],
        [false],
        {
          from: guardian,
        }
      );
    });

    // Update a setting, then try again
    it(
      printTitle(
        'guardian',
        'updates a setting, then fails to update a setting again after bootstrap mode is disabled'
      ),
      async () => {
        // Set via bootstrapping
        await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.registration.enabled', true, {
          from: guardian,
        });
        // Disable bootstrap mode
        await setDaoProtocolBootstrapModeDisabled({
          from: guardian,
        });
        // Attempt to change a setting again
        await shouldRevert(
          setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.registration.enabled', false, {
            from: guardian,
          }),
          'Guardian updated bootstrap setting after mode disabled',
          'Bootstrap mode not engaged'
        );
      }
    );
  });
}
