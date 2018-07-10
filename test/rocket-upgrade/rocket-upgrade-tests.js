// Dependencies
const Web3 = require('web3');
const $web3 = new Web3('http://localhost:8545');

import { printTitle, assertThrows, soliditySha3 } from '../_lib/utils/general';
import { compressAbi, decompressAbi } from '../_lib/utils/contract';
import { RocketStorage, RocketDepositToken, RocketUser } from '../_lib/artifacts'
import { initialiseRPDBalance } from '../rocket-deposit/rocket-deposit-utils';
import { scenarioUpgradeContract, scenarioAddContract } from './rocket-upgrade-scenarios';

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

            // Add test method to abi
            let rocketUserNewAbi = rocketUserNew.abi.slice();
            rocketUserNewAbi.push({
                "constant": true,
                "inputs": [],
                "name": "testMethod",
                "outputs": [{
                    "name": "",
                    "type": "uint8"
                }],
                "payable": false,
                "stateMutability": "view",
                "type": "function"
            });

            // Upgrade rocketUser contract address
            await scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUserNew.address,
                upgradedContractAbi: compressAbi(rocketUserNewAbi),
                fromAddress: owner,
            });
            
            // New rocketUser contract address and ABI
            let rocketUserAddressNew = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketUser'));
            let rocketUserAbiNew = await rocketStorage.getString(soliditySha3('contract.abi', 'rocketUser'));

            // Initialise new RocketUser contract from stored data
            let rocketUserNewContract = new $web3.eth.Contract(decompressAbi(rocketUserAbiNew), rocketUserAddressNew);

            // Reset rocketUser contract address
            await scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUser.address,
                upgradedContractAbi: compressAbi(rocketUser.abi),
                fromAddress: owner,
            });

            // Assert contract address has been updated
            assert.notEqual(rocketUserAddressOld, rocketUserAddressNew, 'regular contract was not upgraded');

            // Check that test method added to ABI exists on new contract instance
            assert.notEqual(rocketUserNewContract.methods.testMethod, undefined, 'contract ABI was not successfully upgraded');

        });


        // Cannot upgrade a regular contract that does not exist
        it(printTitle('owner', 'cannot upgrade a nonexistent contract'), async () => {

            // Upgrade nonexistent contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'nonexistentContract',
                upgradedContractAddress: rocketUser.address,
                upgradedContractAbi: compressAbi(rocketUser.abi),
                fromAddress: owner,
            }), 'nonexistent contract was upgraded');

        });


        // Cannot upgrade a regular contract to its current address
        it(printTitle('owner', 'cannot upgrade a contract to its current address'), async () => {

            // Upgrade rocketUser contract to its own address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUser.address,
                upgradedContractAbi: compressAbi(rocketUser.abi),
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
                upgradedContractAbi: compressAbi(rocketDepositTokenNew.abi),
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
                upgradedContractAbi: compressAbi(rocketDepositTokenNew.abi),
                fromAddress: owner,
                forceEther: true,
            });

            // New rocketDepositToken contract address
            let rocketDepositTokenAddressNew = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketDepositToken'));

            // Reset rocketDepositToken contract address
            await scenarioUpgradeContract({
                contractName: 'rocketDepositToken',
                upgradedContractAddress: rocketDepositToken.address,
                upgradedContractAbi: compressAbi(rocketDepositToken.abi),
                fromAddress: owner,
            });

            // Assert contract address has been updated
            assert.notEqual(rocketDepositTokenAddressOld, rocketDepositTokenAddressNew, 'contract with an ether balance was not upgraded by force');

        });


        // TODO: create RPL system unit tests:
        it(printTitle('owner', 'cannot upgrade a contract with an RPL balance'));
        it(printTitle('owner', 'can upgrade a contract with an RPL balance by force'));


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
                upgradedContractAbi: compressAbi(rocketUserNew.abi),
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
                upgradedContractAbi: compressAbi(rocketUserNew.abi),
                fromAddress: owner,
                forceTokens: true,
            });

            // New rocketUser contract address
            let rocketUserAddressNew = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketUser'));

            // Reset rocketUser contract address
            await scenarioUpgradeContract({
                contractName: 'rocketUser',
                upgradedContractAddress: rocketUser.address,
                upgradedContractAbi: compressAbi(rocketUser.abi),
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
                upgradedContractAbi: compressAbi(rocketUserNew.abi),
                fromAddress: userFirst,
            }), 'regular contract was upgraded by non owner');

        });


        // Owner can add a contract
        it(printTitle('owner', 'can add a contract'), async () => {

            // Old rocketUser contract address
            let rocketTestAddressOld = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketTest1'));

            // Add test method to abi
            let rocketUserNewAbi = rocketUserNew.abi.slice();
            rocketUserNewAbi.push({
                "constant": true,
                "inputs": [],
                "name": "testMethod",
                "outputs": [{
                    "name": "",
                    "type": "uint8"
                }],
                "payable": false,
                "stateMutability": "view",
                "type": "function"
            });

            // Add rocketTest1 contract
            await scenarioAddContract({
                contractName: 'rocketTest1',
                contractAddress: rocketUserNew.address,
                contractAbi: compressAbi(rocketUserNewAbi),
                fromAddress: owner,
            });

            // New rocketUser contract address and ABI
            let rocketTestAddressNew = await rocketStorage.getAddress(soliditySha3('contract.name', 'rocketTest1'));
            let rocketTestAbiNew = await rocketStorage.getString(soliditySha3('contract.abi', 'rocketTest1'));

            // Initialise new RocketUser contract from stored data
            let rocketTestContract = new $web3.eth.Contract(decompressAbi(rocketTestAbiNew), rocketTestAddressNew);

            // Assert contract has been added
            assert.equal(rocketTestAddressOld, '0x0000000000000000000000000000000000000000', 'contract already existed');
            assert.notEqual(rocketTestAddressNew, '0x0000000000000000000000000000000000000000', 'contract was not added');

            // Check that test method added to ABI exists on new contract instance
            assert.notEqual(rocketTestContract.methods.testMethod, undefined, 'contract ABI was not successfully set');

        });


        // Owner cannot add a contract with a null address
        it(printTitle('owner', 'cannot add a contract with a null address'), async () => {

            // Add test contract
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest2',
                contractAddress: '0x0000000000000000000000000000000000000000',
                contractAbi: compressAbi(rocketUserNew.abi),
                fromAddress: owner,
            }), 'contract with a null address was added');

        });


        // Owner cannot add a contract with an existing name
        it(printTitle('owner', 'cannot add a contract with an existing name'), async () => {

            // Add test contract
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest1',
                contractAddress: rocketDepositTokenNew.address,
                contractAbi: compressAbi(rocketDepositTokenNew.abi),
                fromAddress: owner,
            }), 'contract with an existing name was added');

        });


        // Owner cannot add a contract with an existing address
        it(printTitle('owner', 'cannot add a contract with an existing address'), async () => {

            // Add test contract
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest3',
                contractAddress: rocketUserNew.address,
                contractAbi: compressAbi(rocketUserNew.abi),
                fromAddress: owner,
            }), 'contract with an existing address was added');

        });


        // Non-owner cannot add a contract
        it(printTitle('non owner', 'cannot add a contract'), async () => {

            // Add rocketTest1 contract
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest4',
                contractAddress: rocketDepositTokenNew.address,
                contractAbi: compressAbi(rocketDepositTokenNew.abi),
                fromAddress: userFirst,
            }), 'contract was added by non owner');

        });


    });

};
