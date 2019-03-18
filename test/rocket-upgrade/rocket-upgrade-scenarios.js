import { RocketUpgrade, RocketStorage, UtilAddressSetStorage } from "../_lib/artifacts";


// Get upgrade approvers
async function getUpgradeApprovers() {
    const utilAddressSetStorage = await UtilAddressSetStorage.deployed();
    const key = web3.utils.soliditySha3("upgrade.approvers");

    // Get approver set count
    let count = parseInt(await utilAddressSetStorage.getCount.call(key));

    // Get and return approver set
    let approvers = [];
    for (let ai = 0; ai < count; ++ai) {
        let approver = await utilAddressSetStorage.getItem.call(key, ai);
        approvers.push(approver);
    }
    return approvers;

}


// Initialise upgrade approvers
export async function scenarioInitialiseUpgradeApprovers({approvers, fromAddress}) {
    const rocketUpgrade = await RocketUpgrade.deployed();

    // Get initial upgrade approvers
    let upgradeApprovers1 = await getUpgradeApprovers();

    // Initialise approvers
    await rocketUpgrade.initialiseUpgradeApprovers(approvers, {from: fromAddress});

    // Get updated upgrade approvers
    let upgradeApprovers2 = await getUpgradeApprovers();

    // Asserts
    assert.equal(upgradeApprovers1.length, 0, 'Invalid initial upgrade approvers set size');
    assert.equal(upgradeApprovers2.length, 3, 'Invalid updated upgrade approvers set size');
    upgradeApprovers2.forEach((address, ai) => {
        assert.equal(upgradeApprovers2.indexOf(address), ai, 'Duplicate upgrade approver address found');
    });

};


// Transfer upgrade approver permissions
export async function scenarioTransferUpgradeApprover({oldAddress, newAddress, fromAddress}) {
    const rocketUpgrade = await RocketUpgrade.deployed();
    const rocketStorage = await RocketStorage.deployed();

    // Check if transfer is already initialised
    let initialisedBy = await rocketStorage.getAddress.call(web3.utils.soliditySha3("upgrade.approver.transfer.init", oldAddress, newAddress));
    let expectComplete = (initialisedBy != '0x0000000000000000000000000000000000000000');

    // Get initial upgrade approvers
    let upgradeApprovers1 = await getUpgradeApprovers();

    // Transfer approver
    await rocketUpgrade.transferUpgradeApprover(oldAddress, newAddress, {from: fromAddress});

    // Get updated upgrade approvers
    let upgradeApprovers2 = await getUpgradeApprovers();

    // Asserts
    assert.equal(upgradeApprovers1.length, 3, 'Invalid initial upgrade approvers set size');
    assert.equal(upgradeApprovers2.length, 3, 'Invalid updated upgrade approvers set size');
    upgradeApprovers1.forEach((address1, ai) => {
        let address2 = upgradeApprovers2[ai];
        if (expectComplete && address1.toLowerCase() == oldAddress.toLowerCase()) {
            assert.equal(address2.toLowerCase(), newAddress.toLowerCase(), 'Upgrade approver was not updated successfully');
        } else {
            assert.equal(address1, address2, 'Upgrade approver changed and should not have');
        }
    });

}


// Runs upgrade contract scenario
export async function scenarioUpgradeContract({contractName, upgradedContractAddress, upgradedContractAbi, forceEther = false, forceTokens = false, fromAddress}) {
    const rocketUpgrade = await RocketUpgrade.deployed();

    // Upgrade a contract
    await rocketUpgrade.upgradeContract(contractName, upgradedContractAddress, upgradedContractAbi, forceEther, forceTokens, {from: fromAddress});

};


// Runs add contract scenario
export async function scenarioAddContract({contractName, contractAddress, contractAbi, fromAddress}) {
    const rocketUpgrade = await RocketUpgrade.deployed();

    // Add a contract
    await rocketUpgrade.addContract(contractName, contractAddress, contractAbi, {from: fromAddress});

};

