import { printTitle, assertThrows, soliditySha3 } from '../utils';
import { RocketUpgrade, RocketStorage, RocketUser, RocketRole } from '../artifacts';
import { scenarioUpgradeContract } from './rocket-upgrade-scenarios';

const Web3 = require('web3');

export default function({owner, accounts}) {

    describe('RocketUpgrade', async () => {


        // Contract dependencies
        let rocketUpgrade;
        let rocketStorage;
        let rocketUser;
        let rocketRole;
        before(async () => {
            rocketUpgrade = await RocketUpgrade.deployed();
            rocketStorage = await RocketStorage.deployed();
            rocketUser = await RocketUser.deployed();
            rocketRole = await RocketRole.deployed();
        });


        // Owner can upgrade a regular contract with no ether / token balance
        it(printTitle('owner', 'can upgrade a regular contract'), async () => {

            // Old rocketUser contract address
            let rocketUserAddressOld = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketUser'));

            // Upgrade rocketUser contract to rocketRole contract address
            await scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketRole.address,
                fromAddress: owner,
            });
            
            // New rocketUser contract address
            let rocketUserAddressNew = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketUser'));

            // Assert contract address has been updated
            assert.notEqual(rocketUserAddressOld, rocketUserAddressNew, 'regular contract was not upgraded');

        });


        // Non-owner cannot upgrade a regular contract
        it(printTitle('non owner', 'cannot upgrade a regular contract'), async () => {

            // Upgrade rocketUser contract to rocketRole contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketRole.address,
                fromAddress: accounts[1],
            }), 'regular contract was upgraded');

        });


    });

};
