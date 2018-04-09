import { printTitle, assertThrows, soliditySha3 } from '../utils';
import { RocketStorage, RocketDepositToken, RocketUser } from '../artifacts';
import { initialiseRPDBalance } from '../rocket-deposit/rocket-deposit-utils';
import { scenarioUpgradeContract } from './rocket-upgrade-scenarios';

export default function({owner}) {

    contract('RocketUpgrade', async (accounts) => {


        /**
         * Config
         */

        // User addresses
        const userFirst = accounts[1];
        const userThird = accounts[3];

        // Node addresses
        const nodeFirst = accounts[8];


        /**
         * Tests
         */


        // Contract dependencies
        let rocketStorage;
        let rocketDepositToken;
        let rocketDepositTokenNew;
        let rocketUser;
        let rocketUserNew;
        before(async () => {
            rocketStorage = await RocketStorage.deployed();
            rocketDepositToken = await RocketDepositToken.deployed();
            rocketDepositTokenNew = await RocketDepositToken.new(rocketStorage.address, {gas: 5000000, gasPrice: 10000000000, from: owner});
            rocketUser = await RocketUser.deployed();
            rocketUserNew = await RocketUser.new(rocketStorage.address, {gas: 5000000, gasPrice: 10000000000, from: owner});
        });


        // Initialise RPD balances
        before(async () => {
            await initialiseRPDBalance({
                accountAddress: userThird,
                nodeAddress: nodeFirst,
                nodeRegisterAddress: owner,
            });
        });


        // Owner can upgrade a regular contract with no ether / token balance
        it(printTitle('owner', 'can upgrade a regular contract'), async () => {

            // Old rocketUser contract address
            let rocketUserAddressOld = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketUser'));

            // Upgrade rocketUser contract address
            await scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUserNew.address,
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
                upgradedContractAddress: rocketUser.address,
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
                from: userFirst,
                to: rocketDepositToken.address,
                value: web3.toWei('1', 'ether'),
            });

            // Check rocketDepositToken contract ether balance
            assert.notEqual(web3.eth.getBalance(rocketDepositToken.address).valueOf(), 0, 'contract does not have an ether balance');

            // Upgrade rocketDepositToken contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketDepositToken',
                upgradedContractAddress: rocketDepositTokenNew.address,
                fromAddress: owner,
            }), 'contract with an ether balance was upgraded');

        });


        // Can upgrade a regular contract with an ether balance by force
        it(printTitle('owner', 'can upgrade a contract with an ether balance by force'), async () => {

            // Check rocketDepositToken contract ether balance
            assert.notEqual(web3.eth.getBalance(rocketDepositToken.address).valueOf(), 0, 'contract does not have an ether balance');

            // Old rocketDepositToken contract address
            let rocketDepositTokenAddressOld = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketDepositToken'));

            // Upgrade rocketDepositToken contract address
            await scenarioUpgradeContract({
                contractName: 'rocketDepositToken',
                upgradedContractAddress: rocketDepositTokenNew.address,
                fromAddress: owner,
                forceEther: true,
            });

            // New rocketDepositToken contract address
            let rocketDepositTokenAddressNew = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketDepositToken'));

            // Reset rocketDepositToken contract address
            await scenarioUpgradeContract({
                contractName: 'rocketDepositToken',
                upgradedContractAddress: rocketDepositToken.address,
                fromAddress: owner,
            });

            // Assert contract address has been updated
            assert.notEqual(rocketDepositTokenAddressOld, rocketDepositTokenAddressNew, 'contract with an ether balance was not upgraded by force');

        });


        // TODO: create RPL system unit tests:
        // - cannot upgrade a contract with an RPL balance
        // - can upgrade a contract with an RPL balance by force


        // Cannot upgrade a regular contract with an RPD balance
        it(printTitle('owner', 'cannot upgrade a contract with an RPD balance'), async () => {

            // Third user has an RPD balance
            let rpdFromAccount = userThird;
            let rpdFromBalance = await rocketDepositToken.balanceOf(rpdFromAccount);

            // Send 50% of RPD to rocketUser contract
            let rpdSendAmount = parseInt(rpdFromBalance.valueOf() / 2);
            await rocketDepositToken.transfer(rocketUser.address, rpdSendAmount, {from: rpdFromAccount});

            // Check rocketUser contract RPD balance
            let rocketUserRpdBalance = await rocketDepositToken.balanceOf(rocketUser.address);
            assert.notEqual(rocketUserRpdBalance.valueOf(), 0, 'contract does not have an RPD balance');

            // Upgrade rocketUser contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUserNew.address,
                fromAddress: owner,
            }), 'contract with an RPD balance was upgraded');

        });


        // Can upgrade a regular contract with an RPD balance by force
        it(printTitle('owner', 'can upgrade a contract with an RPD balance by force'), async () => {

            // Check rocketUser contract RPD balance
            let rocketUserRpdBalance = await rocketDepositToken.balanceOf(rocketUser.address);
            assert.notEqual(rocketUserRpdBalance.valueOf(), 0, 'contract does not have an RPD balance');

            // Old rocketUser contract address
            let rocketUserAddressOld = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketUser'));

            // Upgrade rocketUser contract address
            await scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUserNew.address,
                fromAddress: owner,
                forceTokens: true,
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
            assert.notEqual(rocketUserAddressOld, rocketUserAddressNew, 'contract with an RPD balance was not upgraded by force');

        });


        // Non-owner cannot upgrade a regular contract
        it(printTitle('non owner', 'cannot upgrade a regular contract'), async () => {

            // Upgrade rocketUser contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUserNew.address,
                fromAddress: userFirst,
            }), 'regular contract was upgraded by non owner');

        });


    });

};
