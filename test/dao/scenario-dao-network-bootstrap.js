import { RocketDAONetwork, RocketDAONetworkSettings } from '../_utils/artifacts';



// Change a trusted node DAO setting while bootstrap mode is enabled
export async function setDAONetworkBootstrapSetting(_settingPath, _value, txOptions) {

    // Load contracts
    const rocketDAONetwork = await RocketDAONetwork.deployed();
    const rocketDAONetworkSettings = await RocketDAONetworkSettings.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONetworkSettings.getSettingUint.call(_settingPath),
        ]).then(
            ([settingUintValue]) =>
            ({settingUintValue})
        );
    }

    // Capture data
    let ds1 = await getTxData();
    //console.log(Number(ds1.settingValue));

    // Set as a bootstrapped member
    await rocketDAONetwork.bootstrapSettingUint(_settingPath, _value, txOptions);

    // Capture data
    let ds2 = await getTxData();
    //console.log(Number(ds2.settingValue));

    // Check it was updated
    assert(ds2.settingUintValue.eq(web3.utils.toBN(_value)), 'DAO network setting not updated in bootstrap mode');

}

// Set a contract that can claim rewards
export async function setDAONetworkBootstrapRewardsClaimer(_contractName, _perc, txOptions, expectedTotalPerc = null) {
    // Load contracts
    const rocketDAONetwork = await RocketDAONetwork.deployed();
    const rocketDAONetworkSettings = await RocketDAONetworkSettings.deployed();
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAONetworkSettings.getRewardsClaimerPerc(_contractName),
            rocketDAONetworkSettings.getRewardsClaimersPercTotal(),
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
        let targetTotalPerc = expectedTotalPerc
        assert(dataSet2.rewardsClaimersPercTotal.eq(web3.utils.toBN(web3.utils.toWei(expectedTotalPerc.toString()))), 'Total claim percentage not matching given target');
    } 
};


// Set the current rewards claim period in blocks
export async function setRewardsClaimIntervalBlocks(intervalBlocks, txOptions) {
    // Set it now
    await setDAONetworkBootstrapSetting('rpl.rewards.claim.period.blocks', intervalBlocks, txOptions);
};

// Set the current RPL inflation rate
export async function setRPLInflationIntervalRate(yearlyInflationPerc, txOptions) {
    // Calculate the inflation rate per day
    let dailyInflation = web3.utils.toBN((1 + yearlyInflationPerc) ** (1 / (365)) * 1e18);
    // Set it now
    await setDAONetworkBootstrapSetting('rpl.inflation.interval.rate', dailyInflation, txOptions);
};

// Set the current RPL inflation rate blocks, how often inflation is calculated
export async function setRPLInflationIntervalBlocks(intervalBlocks, txOptions) {
    // Set it now
    await setDAONetworkBootstrapSetting('rpl.inflation.interval.blocks', intervalBlocks, txOptions);
};

// Set the current RPL inflation block interval
export async function setRPLInflationStartBlock(startBlock, txOptions) {
    // Set it now
    await setDAONetworkBootstrapSetting('rpl.inflation.interval.start', startBlock, txOptions);
};
