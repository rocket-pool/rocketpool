import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import {
    RocketDAOProtocolSettingsDeposit, RocketDAOProtocolSettingsInflation,
    RocketDAOProtocolSettingsMinipool, RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsNode,
} from '../_utils/artifacts';

export async function setDefaultParameters() {
    const [guardian] = await web3.eth.getAccounts();
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.enabled', true, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.assign.enabled', true, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsDeposit, 'deposit.pool.maximum', '1000'.ether, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.registration.enabled', true, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.deposit.enabled', true, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.submit.withdrawable.enabled', true, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', '0.05'.ether, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', '0.1'.ether, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', '0.2'.ether, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.demand.range', '1000'.ether, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsInflation, 'rpl.inflation.interval.start', Math.floor(new Date().getTime() / 1000) + (60 * 60 * 24 * 14), { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsMinipool, 'minipool.bond.reduction.enabled', true, { from: guardian });
    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNode, 'node.vacant.minipools.enabled', true, { from: guardian });
}