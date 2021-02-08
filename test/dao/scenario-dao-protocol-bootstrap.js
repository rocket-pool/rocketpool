import { RocketDAOProtocol, RocketDAOProtocolSettingsRewards, RocketDAOProtocolSettingsInflation, RocketTokenRPL, RocketVault } from '../_utils/artifacts';



// Change a trusted node DAO setting while bootstrap mode is enabled
export async function setDAONetworkBootstrapSetting(_settingContractInstance, _settingPath, _value, txOptions) {

    // Helper function
    String.prototype.lowerCaseFirstLetter = function() {
        return this.charAt(0).toLowerCase() + this.slice(1);
    }

    // Load contracts
    const rocketDAOProtocol = await RocketDAOProtocol.deployed();
    const rocketDAOProtocolSettingsContract = await _settingContractInstance.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProtocolSettingsContract.getSettingUint.call(_settingPath),
            rocketDAOProtocolSettingsContract.getSettingBool.call(_settingPath)
        ]).then(
            ([settingUintValue, settingBoolValue]) =>
            ({settingUintValue, settingBoolValue})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Set as a bootstrapped setting. detect type first, can be a number, string or bn object
    if(typeof(_value) == 'number' || typeof(_value) == 'string' || typeof(_value) == 'object') await rocketDAOProtocol.bootstrapSettingUint(_settingContractInstance._json.contractName.lowerCaseFirstLetter(), _settingPath, _value, txOptions);
    if(typeof(_value) == 'boolean') await rocketDAOProtocol.bootstrapSettingBool(_settingContractInstance._json.contractName.lowerCaseFirstLetter(), _settingPath, _value, txOptions);
    
    // Capture data
    let ds2 = await getTxData();

    // Check it was updated
    if(typeof(_value) == 'number' || typeof(_value) == 'string') await assert(ds2.settingUintValue.eq(web3.utils.toBN(_value)), 'DAO protocol uint256 setting not updated in bootstrap mode');
    if(typeof(_value) == 'boolean')  await assert(ds2.settingBoolValue == _value, 'DAO protocol boolean setting not updated in bootstrap mode');
}

// Set a contract that can claim rewards
export async function setDAONetworkBootstrapRewardsClaimer(_contractName, _perc, txOptions, expectedTotalPerc = null) {
    // Load contracts
    const rocketDAOProtocol = await RocketDAOProtocol.deployed();
    const rocketDAOProtocolSettingsRewards = await RocketDAOProtocolSettingsRewards.deployed();
    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProtocolSettingsRewards.getRewardsClaimerPerc(_contractName),
            rocketDAOProtocolSettingsRewards.getRewardsClaimersPercTotal(),
        ]).then(
            ([rewardsClaimerPerc, rewardsClaimersPercTotal]) =>
            ({rewardsClaimerPerc, rewardsClaimersPercTotal})
        );
    }
    // Capture data
    let dataSet1 = await getTxData();
    //console.log(dataSet1.rewardsClaimerPerc.toString(), dataSet1.rewardsClaimersPercTotal.toString());
    // Perform tx
    await rocketDAOProtocol.bootstrapSettingClaimer(_contractName, _perc, txOptions);
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
    await setDAONetworkBootstrapSetting(RocketDAOProtocolSettingsRewards, 'rpl.rewards.claim.period.blocks', intervalBlocks, txOptions);
};


// Spend the DAO treasury in bootstrap mode
export async function spendRewardsClaimTreasury(_invoiceID, _recipientAddress, _amount, txOptions) {

    // Load contracts
    const rocketDAOProtocol = await RocketDAOProtocol.deployed();
    const rocketTokenRPL = await RocketTokenRPL.deployed();
    const rocketVault = await RocketVault.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketVault.balanceOfToken('rocketClaimDAO', rocketTokenRPL.address),
            rocketTokenRPL.balanceOf(_recipientAddress),
        ]).then(
            ([daoClaimTreasuryBalance, recipientBalance]) =>
            ({daoClaimTreasuryBalance, recipientBalance})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // console.log(web3.utils.fromWei(ds1.daoClaimTreasuryBalance), web3.utils.fromWei(ds1.recipientBalance), web3.utils.fromWei(_amount));
    
    // Perform tx
    await rocketDAOProtocol.bootstrapSpendTreasury(_invoiceID, _recipientAddress, _amount, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // console.log(web3.utils.fromWei(ds2.daoClaimTreasuryBalance), web3.utils.fromWei(ds2.recipientBalance), web3.utils.fromWei(_amount));

    // Verify the amount sent is correct
    assert(ds2.recipientBalance.eq(ds1.recipientBalance.add(_amount)), "Amount spent by treasury does not match recipients received amount");

}


/*** Inflation *******/

// Set the current RPL inflation rate
export async function setRPLInflationIntervalRate(yearlyInflationPerc, txOptions) {
    // Calculate the inflation rate per day
    let dailyInflation = web3.utils.toBN((1 + yearlyInflationPerc) ** (1 / (365)) * 1e18);
    // Set it now
    await setDAONetworkBootstrapSetting(RocketDAOProtocolSettingsInflation, 'rpl.inflation.interval.rate', dailyInflation, txOptions);
};

// Set the current RPL inflation rate blocks, how often inflation is calculated
export async function setRPLInflationIntervalBlocks(intervalBlocks, txOptions) {
    // Set it now
    await setDAONetworkBootstrapSetting(RocketDAOProtocolSettingsInflation, 'rpl.inflation.interval.blocks', intervalBlocks, txOptions);
};

// Set the current RPL inflation block interval
export async function setRPLInflationStartBlock(startBlock, txOptions) {
    // Set it now
    await setDAONetworkBootstrapSetting(RocketDAOProtocolSettingsInflation, 'rpl.inflation.interval.start', startBlock, txOptions);
};


// Disable bootstrap mode
export async function setDaoProtocolBootstrapModeDisabled(txOptions) {

    // Load contracts
    const rocketDAOProtocol = await RocketDAOProtocol.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProtocol.getBootstrapModeDisabled.call(),
        ]).then(
            ([bootstrapmodeDisabled]) =>
            ({bootstrapmodeDisabled})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // Set as a bootstrapped member
    await rocketDAOProtocol.bootstrapDisable(true, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // Check ID has been recorded
    assert(ds2.bootstrapmodeDisabled == true, 'Bootstrap mode was not disabled');

}

