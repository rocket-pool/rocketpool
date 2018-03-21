import { printTitle, assertThrows, soliditySha3 } from '../utils';
import { RocketUpgrade, RocketStorage, RocketUser, RocketRole, RocketPool } from '../artifacts';
import { scenarioUpgradeContract } from './rocket-upgrade-scenarios';

const Web3 = require('web3');

export default function({owner, accounts}) {

    describe('RocketUpgrade', async () => {


        // Contract dependencies
        let rocketUpgrade;
        let rocketStorage;
        let rocketUserOriginal;
        let rocketUserNew1;
        let rocketUserNew2;
        before(async () => {
            rocketUpgrade = await RocketUpgrade.deployed();
            rocketStorage = await RocketStorage.deployed();
            rocketUserOriginal = await RocketUser.deployed();
            rocketUserNew1 = await RocketRole.deployed();
            rocketUserNew2 = await RocketPool.deployed();
        });


        // Owner can upgrade a regular contract with no ether / token balance
        it(printTitle('owner', 'can upgrade a regular contract'), async () => {

            // Old rocketUser contract address
            let rocketUserAddressOld = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketUser'));

            // Upgrade rocketUser contract to rocketRole contract address
            await scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUserNew1.address,
                fromAddress: owner,
            });
            
            // New rocketUser contract address
            let rocketUserAddressNew = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketUser'));

            // Assert contract address has been updated
            assert.notEqual(rocketUserAddressOld, rocketUserAddressNew, 'regular contract was not upgraded');

        });


        // Cannot upgrade a regular contract that does not exist
        it(printTitle('owner', 'cannot upgrade a nonexistent contract'), async () => {

            // Upgrade nonexistent contract to rocketRole contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'nonexistentContract',
                upgradedContractAddress: rocketUserNew2.address,
                fromAddress: owner,
            }), 'nonexistent contract was upgraded');

        });


        // Cannot upgrade a regular contract to its current address
        it(printTitle('owner', 'cannot upgrade a contract to its current address'), async () => {

            // Upgrade rocketUser contract to its own address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUserNew1.address,
                fromAddress: owner,
            }), 'contract was upgraded to its current address');

        });


        // Non-owner cannot upgrade a regular contract
        it(printTitle('non owner', 'cannot upgrade a regular contract'), async () => {

            // Upgrade rocketUser contract to rocketRole contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUserNew2.address,
                fromAddress: accounts[1],
            }), 'regular contract was upgraded by non owner');

        });


    });

};
