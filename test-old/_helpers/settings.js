import {
    RocketDAOProtocolSettingsAuction,
    RocketDAOProtocolSettingsDeposit,
    RocketDAOProtocolSettingsMinipool,
    RocketDAOProtocolSettingsNetwork,
    RocketDAOProtocolSettingsNode,
} from '../_utils/artifacts';

// Auction settings
export async function getAuctionSetting(setting) {
    const rocketAuctionSettings = await RocketDAOProtocolSettingsAuction.deployed();
    return rocketAuctionSettings['get' + setting]();
}

// Deposit settings
export async function getDepositSetting(setting) {
    const rocketDAOProtocolSettingsDeposit = await RocketDAOProtocolSettingsDeposit.deployed();
    return rocketDAOProtocolSettingsDeposit['get' + setting]();
}

// Minipool settings
export async function getMinipoolSetting(setting) {
    const rocketDAOProtocolSettingsMinipool = await RocketDAOProtocolSettingsMinipool.deployed();
    return rocketDAOProtocolSettingsMinipool['get' + setting]();
}

// Network settings
export async function getNetworkSetting(setting) {
    const rocketDAOProtocolSettingsNetwork = await RocketDAOProtocolSettingsNetwork.deployed();
    return rocketDAOProtocolSettingsNetwork['get' + setting]();
}

// Node settings
export async function getNodeSetting(setting) {
    const rocketDAOProtocolSettingsNode = await RocketDAOProtocolSettingsNode.deployed();
    return rocketDAOProtocolSettingsNode['get' + setting]();
}


