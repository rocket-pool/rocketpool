import { RocketDAOProtocolSettingsMinipool, RocketDAOProtocolSettingsNode, RocketUpgradeOneDotTwo } from './artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';


export async function upgradeOneDotTwo(guardian) {
  const rocketUpgradeOneDotTwo = await RocketUpgradeOneDotTwo.deployed();
  await rocketUpgradeOneDotTwo.execute({ from: guardian });

  // Set default test parameters
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.bond.reduction.enabled', true, { from: guardian });
  await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.vacant.minipools.enabled', true, { from: guardian });
}

export async function upgradeExecuted() {
  const rocketUpgradeOneDotTwo = await RocketUpgradeOneDotTwo.deployed();
  return await rocketUpgradeOneDotTwo.executed();
}