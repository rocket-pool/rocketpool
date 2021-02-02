import { RocketDAONetwork, RocketDAONetworkSettingsRewards, RocketDAONetworkSettingsInflation } from '../_utils/artifacts';



// Change a trusted node DAO setting while bootstrap mode is enabled
export async function setDAONetworkBootstrapSetting(_settingContractInstance, _settingPath, _value, txOptions) {


    // Helper function
    String.prototype.lowerCaseFirstLetter = function() {
        return this.charAt(0).toLowerCase() + this.slice(1);
    }

    // Load contracts
    const rocketDAONetwork = await RocketDAONetwork.deployed();
    const rocketDAONetworkSettingsContract = await _settingContractInstance.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONetworkSettingsContract.getSettingUint.call(_settingPath),
            rocketDAONetworkSettingsContract.getSettingBool.call(_settingPath)
        ]).then(
            ([settingUintValue, settingBoolValue]) =>
            ({settingUintValue, settingBoolValue})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Set as a bootstrapped setting. detect type first
    if(typeof(_value) == 'number' || typeof(_value) == 'string') await rocketDAONetwork.bootstrapSettingUint(_settingContractInstance._json.contractName.lowerCaseFirstLetter(), _settingPath, _value, txOptions);
    if(typeof(_value) == 'boolean') await rocketDAONetwork.bootstrapSettingBool(_settingContractInstance._json.contractName.lowerCaseFirstLetter(), _settingPath, _value, txOptions);
    
    // Capture data
    let ds2 = await getTxData();

    // Check it was updated
    if(typeof(_value) == 'number' || typeof(_value) == 'string') await assert(ds2.settingUintValue.eq(web3.utils.toBN(_value)), 'DAO network uint256 setting not updated in bootstrap mode');
    if(typeof(_value) == 'boolean')  await assert(ds2.settingBoolValue == _value, 'DAO network boolean setting not updated in bootstrap mode');
}

// Set a contract that can claim rewards
export async function setDAONetworkBootstrapRewardsClaimer(_contractName, _perc, txOptions, expectedTotalPerc = null) {
    // Load contracts
    const rocketDAONetwork = await RocketDAONetwork.deployed();
    const rocketDAONetworkSettingsRewards = await RocketDAONetworkSettingsRewards.deployed();
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONetworkSettingsRewards.getRewardsClaimerPerc(_contractName),
            rocketDAONetworkSettingsRewards.getRewardsClaimersPercTotal(),
        ]).then(
            ([rewardsClaimerPerc, rewardsClaimersPercTotal]) =>
            ({rewardsClaimerPerc, rewardsClaimersPercTotal})
        );
    }
    // Capture data
    let dataSet1 = await getTxData();
    //console.log(dataSet1.rewardsClaimerPerc.toString(), dataSet1.rewardsClaimersPercTotal.toString());
    // Perform tx
    await rocketDAONetwork.bootstrapSettingClaimer(_contractName, _perc, txOptions);
    // Capture data
    let dataSet2 = await getTxData();
    //console.log(dataSet2.rewardsClaimerPerc.toString(), dataSet2.rewardsClaimersPercTotal.toString());
    // Verify
    assert(dataSet2.rewardsClaimerPerc.eq(web3.utils.toBN(_perc)), 'Claim percentage not updated correctly');

    // Verify an expected total Perc if given
    if(expectedTotalPerc) {
        assert(dataSet2.rewardsClaimersPercTotal.eq(web3.utils.toBN(web3.utils.toWei(expectedTotalPerc.toString()))), 'Total claim percentage not matching given target');
    } 
};


/*** Rewards *******/

// Set the current rewards claim period in blocks
export async function setRewardsClaimIntervalBlocks(intervalBlocks, txOptions) {
    // Set it now
    await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsRewards, 'rpl.rewards.claim.period.blocks', intervalBlocks, txOptions);
};


/*** Inflation *******/

// Set the current RPL inflation rate
export async function setRPLInflationIntervalRate(yearlyInflationPerc, txOptions) {
    // Calculate the inflation rate per day
    let dailyInflation = web3.utils.toBN((1 + yearlyInflationPerc) ** (1 / (365)) * 1e18);
    // Set it now
    await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsInflation, 'rpl.inflation.interval.rate', dailyInflation, txOptions);
};

// Set the current RPL inflation rate blocks, how often inflation is calculated
export async function setRPLInflationIntervalBlocks(intervalBlocks, txOptions) {
    // Set it now
    await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsInflation, 'rpl.inflation.interval.blocks', intervalBlocks, txOptions);
};

// Set the current RPL inflation block interval
export async function setRPLInflationStartBlock(startBlock, txOptions) {
    // Set it now
    await setDAONetworkBootstrapSetting(RocketDAONetworkSettingsInflation, 'rpl.inflation.interval.start', startBlock, txOptions);
};


