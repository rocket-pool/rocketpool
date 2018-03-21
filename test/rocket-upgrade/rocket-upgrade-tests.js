import { printTitle, assertThrows, soliditySha3 } from '../utils';
import { RocketStorage, RocketDepositToken, RocketUser, RocketRole } from '../artifacts';
import { scenarioUpgradeContract } from './rocket-upgrade-scenarios';

export default function({owner, accounts}) {

    describe('RocketUpgrade', async () => {


        // Contract dependencies
        let rocketStorage;
        let rocketDepositToken;
        let rocketUser;
        let rocketRole;
        before(async () => {
            rocketStorage = await RocketStorage.deployed();
            rocketDepositToken = await RocketDepositToken.deployed();
            rocketUser = await RocketUser.deployed();
            rocketRole = await RocketRole.deployed();
        });


        // Owner can upgrade a regular contract with no ether / token balance
        it(printTitle('owner', 'can upgrade a regular contract'), async () => {

            // Old rocketUser contract address
            let rocketUserAddressOld = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketUser'));

            // Upgrade rocketUser contract address
            await scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketRole.address,
                fromAddress: owner,
            });
            
            // New rocketUser contract address
            let rocketUserAddressNew = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketUser'));

            // Reset rocketUser contract address
            await scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUser.address,
                fromAddress: owner,
            });

            // Assert contract address has been updated
            assert.notEqual(rocketUserAddressOld, rocketUserAddressNew, 'regular contract was not upgraded');

        });


        // Cannot upgrade a regular contract that does not exist
        it(printTitle('owner', 'cannot upgrade a nonexistent contract'), async () => {

            // Upgrade nonexistent contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'nonexistentContract',
                upgradedContractAddress: rocketRole.address,
                fromAddress: owner,
            }), 'nonexistent contract was upgraded');

        });


        // Cannot upgrade a regular contract to its current address
        it(printTitle('owner', 'cannot upgrade a contract to its current address'), async () => {

            // Upgrade rocketUser contract to its own address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUser.address,
                fromAddress: owner,
            }), 'contract was upgraded to its current address');

        });


        // Cannot upgrade a regular contract with an ether balance
        it(printTitle('owner', 'cannot upgrade a contract with an ether balance'), async () => {

            // Send ether to rocketDepositToken contract
            let tx = await web3.eth.sendTransaction({
                from: accounts[1],
                to: rocketDepositToken.address,
                value: web3.toWei('1', 'ether'),
            });

            // Upgrade rocketDepositToken contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketDepositToken',
                upgradedContractAddress: rocketRole.address,
                fromAddress: owner,
            }), 'contract with an ether balance was upgraded');

        });


        // Non-owner cannot upgrade a regular contract
        it(printTitle('non owner', 'cannot upgrade a regular contract'), async () => {

            // Upgrade rocketUser contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketRole.address,
                fromAddress: accounts[1],
            }), 'regular contract was upgraded by non owner');

        });


    });

};
