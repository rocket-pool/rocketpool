import { RocketUpgrade } from "../artifacts";

// Runs upgrade contract scenario
export async function scenarioUpgradeContract({contractName, upgradedContractAddress, forceEther = false, forceTokens = false, fromAddress}) {

	// Initialise upgrade contract
	const rocketUpgrade = await RocketUpgrade.deployed();

	// Upgrade a contract
	await rocketUpgrade.upgradeContract(contractName, upgradedContractAddress, forceEther, forceTokens, {from: fromAddress});

};
