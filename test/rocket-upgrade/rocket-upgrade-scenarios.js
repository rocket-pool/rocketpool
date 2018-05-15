import { RocketUpgrade } from "../artifacts";

// Runs upgrade contract scenario
export async function scenarioUpgradeContract({contractName, upgradedContractAddress, forceEther = false, forceTokens = false, fromAddress}) {

    // Get deployed upgrade contract
    const rocketUpgrade = await RocketUpgrade.deployed();

    // Upgrade a contract
    await rocketUpgrade.upgradeContract(contractName, upgradedContractAddress, forceEther, forceTokens, {from: fromAddress});

};

// Runs add contract scenario
export async function scenarioAddContract({contractName, contractAddress, fromAddress}) {

	// Get deployed upgrade contract
    const rocketUpgrade = await RocketUpgrade.deployed();

    // Add a contract
    await rocketUpgrade.addContract(contractName, contractAddress, {from: fromAddress});

}
