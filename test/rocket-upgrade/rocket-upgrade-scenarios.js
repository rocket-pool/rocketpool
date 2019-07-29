import { RocketUpgrade, RocketUpgradeApproval, RocketStorage, UtilAddressSetStorage } from "../_lib/artifacts";
import { compressAbi, decompressAbi } from '../_lib/utils/contract';


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
    const rocketUpgradeApproval = await RocketUpgradeApproval.deployed();

    // Get initial upgrade approvers
    let upgradeApprovers1 = await getUpgradeApprovers();

    // Initialise approvers
    await rocketUpgradeApproval.initialiseUpgradeApprovers(approvers, {from: fromAddress});

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
    const rocketUpgradeApproval = await RocketUpgradeApproval.deployed();
    const rocketStorage = await RocketStorage.deployed();

    // Check if transfer is already initialised
    let initialisedBy = await rocketStorage.getAddress.call(web3.utils.soliditySha3("upgrade.approver.transfer.init", oldAddress, newAddress));
    let expectComplete = (initialisedBy != '0x0000000000000000000000000000000000000000');

    // Get initial upgrade approvers
    let upgradeApprovers1 = await getUpgradeApprovers();

    // Transfer approver
    await rocketUpgradeApproval.transferUpgradeApprover(oldAddress, newAddress, {from: fromAddress});

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
    const rocketStorage = await RocketStorage.deployed();

    // Add test method to ABI
    let upgradedContractAbiTest = upgradedContractAbi.slice();
    upgradedContractAbiTest.push({
        "constant": true,
        "inputs": [],
        "name": "testMethod",
        "outputs": [{
            "name": "",
            "type": "uint8"
        }],
        "payable": false,
        "stateMutability": "view",
        "type": "function",
    });
    let upgradedContractAbiCompressed = compressAbi(upgradedContractAbiTest);

    // Check if upgrade is already initialised
    let initialisedBy = await rocketStorage.getAddress.call(web3.utils.soliditySha3("contract.upgrade.init", contractName, upgradedContractAddress, upgradedContractAbiCompressed, forceEther, forceTokens));
    let expectComplete = (initialisedBy != '0x0000000000000000000000000000000000000000');

    // Get initial contract data
    let contractAddress1 = await rocketStorage.getAddress.call(web3.utils.soliditySha3('contract.name', contractName));
    let contractAbi1 = await rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', contractName));

    // Upgrade contract
    await rocketUpgrade.upgradeContract(contractName, upgradedContractAddress, upgradedContractAbiCompressed, forceEther, forceTokens, {from: fromAddress});

    // Get updated contract data
    let contractAddress2 = await rocketStorage.getAddress.call(web3.utils.soliditySha3('contract.name', contractName));
    let contractAbi2 = await rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', contractName));

    // Initialise new contract from stored data
    let newContract = new web3.eth.Contract(decompressAbi(contractAbi2), contractAddress2);

    // Asserts
    if (expectComplete) {
        assert.notEqual(contractAddress1, contractAddress2, 'Contract address was not changed');
        assert.equal(contractAddress2, upgradedContractAddress, 'Contract address was not updated');
        assert.notEqual(newContract.methods.testMethod, undefined, 'Contract ABI was not successfully upgraded');
    } else {
        assert.equal(contractAddress1, contractAddress2, 'Contract address changed and should not have');
        assert.equal(contractAbi1, contractAbi2, 'Contract ABI changed and should not have');
    }

};


// Runs add contract scenario
export async function scenarioAddContract({contractName, contractAddress, contractAbi, fromAddress}) {
    const rocketUpgrade = await RocketUpgrade.deployed();
    const rocketStorage = await RocketStorage.deployed();

    // Add test method to ABI
    let contractAbiTest = contractAbi.slice();
    contractAbiTest.push({
        "constant": true,
        "inputs": [],
        "name": "testMethod",
        "outputs": [{
            "name": "",
            "type": "uint8"
        }],
        "payable": false,
        "stateMutability": "view",
        "type": "function",
    });
    let contractAbiCompressed = compressAbi(contractAbiTest);

    // Get initial contract data
    let contractAddress1 = await rocketStorage.getAddress.call(web3.utils.soliditySha3('contract.name', contractName));
    let contractAbi1 = await rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', contractName));

    // Add contract
    await rocketUpgrade.addContract(contractName, contractAddress, contractAbiCompressed, {from: fromAddress});

    // Get updated contract data
    let contractAddress2 = await rocketStorage.getAddress.call(web3.utils.soliditySha3('contract.name', contractName));
    let contractAbi2 = await rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', contractName));

    // Initialise new contract from stored data
    let newContract = new web3.eth.Contract(decompressAbi(contractAbi2), contractAddress2);

    // Asserts
    assert.equal(contractAddress1, '0x0000000000000000000000000000000000000000', 'Contract address already existed');
    assert.equal(contractAbi1, '', 'Contract ABI already existed');
    assert.notEqual(contractAddress2, '0x0000000000000000000000000000000000000000', 'Contract was not added');
    assert.notEqual(newContract.methods.testMethod, undefined, 'Contract ABI was not successfully set');

};


// Runs upgrade ABI scenario
export async function scenarioUpgradeABI({contractName, upgradedContractAbi, fromAddress}) {
    const rocketUpgrade = await RocketUpgrade.deployed();
    const rocketStorage = await RocketStorage.deployed();

    // Add test method to ABI
    let upgradedContractAbiTest = upgradedContractAbi.slice();
    upgradedContractAbiTest.push({
        "constant": true,
        "inputs": [],
        "name": "testMethod",
        "outputs": [{
            "name": "",
            "type": "uint8"
        }],
        "payable": false,
        "stateMutability": "view",
        "type": "function",
    });
    let upgradedContractAbiCompressed = compressAbi(upgradedContractAbiTest);

    // Check if upgrade is already initialised
    let initialisedBy = await rocketStorage.getAddress.call(web3.utils.soliditySha3("abi.upgrade.init", contractName, upgradedContractAbiCompressed));
    let expectComplete = (initialisedBy != '0x0000000000000000000000000000000000000000');

    // Get initial contract data
    let contractAbi1 = await rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', contractName));

    // Upgrade ABI
    await rocketUpgrade.upgradeABI(contractName, upgradedContractAbiCompressed, {from: fromAddress});

    // Get updated contract data
    let contractAbi2 = await rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', contractName));

    // Initialise new contract from stored data
    let newContract = new web3.eth.Contract(decompressAbi(contractAbi2));

    // Asserts
    if (expectComplete) {
        assert.notEqual(newContract.methods.testMethod, undefined, 'Contract ABI was not successfully upgraded');
    } else {
        assert.equal(contractAbi1, contractAbi2, 'Contract ABI changed and should not have');
    }

};


// Runs add ABI scenario
export async function scenarioAddABI({contractName, contractAbi, fromAddress}) {
    const rocketUpgrade = await RocketUpgrade.deployed();
    const rocketStorage = await RocketStorage.deployed();

    // Add test method to ABI
    let contractAbiTest = contractAbi.slice();
    contractAbiTest.push({
        "constant": true,
        "inputs": [],
        "name": "testMethod",
        "outputs": [{
            "name": "",
            "type": "uint8"
        }],
        "payable": false,
        "stateMutability": "view",
        "type": "function",
    });
    let contractAbiCompressed = compressAbi(contractAbiTest);

    // Get initial contract data
    let contractAbi1 = await rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', contractName));

    // Add ABI
    await rocketUpgrade.addABI(contractName, contractAbiCompressed, {from: fromAddress});

    // Get updated contract data
    let contractAbi2 = await rocketStorage.getString.call(web3.utils.soliditySha3('contract.abi', contractName));

    // Initialise new contract from stored data
    let newContract = new web3.eth.Contract(decompressAbi(contractAbi2));

    // Asserts
    assert.equal(contractAbi1, '', 'Contract ABI already existed');
    assert.notEqual(newContract.methods.testMethod, undefined, 'Contract ABI was not successfully set');

};

