import { printTitle, assertThrows } from '../_lib/utils/general';
import { compressAbi, decompressAbi } from '../_lib/utils/contract';
import { RocketStorage, RocketNode, RocketPIP } from '../_lib/artifacts'
import { scenarioUpgradeContract, scenarioAddContract } from './rocket-upgrade-scenarios';

export default function() {

    contract('RocketUpgrade', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const userFirst = accounts[1];
        const userSecond = accounts[2];


        // Setup
        let rocketStorage;
        let rocketNode;
        let rocketNodeNew;
        let rocketPIP;
        let rocketPIPNew;
        before(async () => {
            rocketStorage = await RocketStorage.deployed();
            rocketNode = await RocketNode.deployed();
            rocketNodeNew = await RocketNode.new(rocketStorage.address, {from: owner});
            rocketPIP = await RocketPIP.deployed();
            rocketPIPNew = await RocketPIP.new(rocketStorage.address, {from: owner});
        });


        // Owner can upgrade a regular contract with no ether / token balance
        it(printTitle('owner', 'can upgrade a regular contract'), async () => {

            // Old rocketPIP contract address
            let rocketPIPAddressOld = await rocketStorage.getAddress(web3.utils.soliditySha3('contract.name', 'rocketPIP'));

            // Add test method to abi
            let rocketPIPNewAbi = rocketPIPNew.abi.slice();
            rocketPIPNewAbi.push({
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

            // Upgrade rocketPIP contract address
            await scenarioUpgradeContract({
                contractName: 'rocketPIP',
                upgradedContractAddress: rocketPIPNew.address,
                upgradedContractAbi: compressAbi(rocketPIPNewAbi),
                fromAddress: owner,
            });
            
            // New rocketPIP contract address and ABI
            let rocketPIPAddressNew = await rocketStorage.getAddress(web3.utils.soliditySha3('contract.name', 'rocketPIP'));
            let rocketPIPAbiNew = await rocketStorage.getString(web3.utils.soliditySha3('contract.abi', 'rocketPIP'));

            // Initialise new RocketPIP contract from stored data
            let rocketPIPNewContract = new web3.eth.Contract(decompressAbi(rocketPIPAbiNew), rocketPIPAddressNew);

            // Reset rocketPIP contract address
            await scenarioUpgradeContract({
                contractName: 'rocketPIP',
                upgradedContractAddress: rocketPIP.address,
                upgradedContractAbi: compressAbi(rocketPIP.abi),
                fromAddress: owner,
            });

            // Assert contract address has been updated
            assert.notEqual(rocketPIPAddressOld, rocketPIPAddressNew, 'regular contract was not upgraded');

            // Check that test method added to ABI exists on new contract instance
            assert.notEqual(rocketPIPNewContract.methods.testMethod, undefined, 'contract ABI was not successfully upgraded');

        });


        // Cannot upgrade a regular contract that does not exist
        it(printTitle('owner', 'cannot upgrade a nonexistent contract'), async () => {

            // Upgrade nonexistent contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'nonexistentContract',
                upgradedContractAddress: rocketPIP.address,
                upgradedContractAbi: compressAbi(rocketPIP.abi),
                fromAddress: owner,
            }), 'nonexistent contract was upgraded');

        });


        // Cannot upgrade a regular contract to its current address
        it(printTitle('owner', 'cannot upgrade a contract to its current address'), async () => {

            // Upgrade rocketPIP contract to its own address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketPIP',
                upgradedContractAddress: rocketPIP.address,
                upgradedContractAbi: compressAbi(rocketPIP.abi),
                fromAddress: owner,
            }), 'contract was upgraded to its current address');

        });


        // TODO: implement contracts with public payable methods callable from anywhere
        it(printTitle('owner', 'cannot upgrade a contract with an ether balance'));
        it(printTitle('owner', 'can upgrade a contract with an ether balance by force'));


        // TODO: create RPL system unit tests:
        it(printTitle('owner', 'cannot upgrade a contract with an RPL balance'));
        it(printTitle('owner', 'can upgrade a contract with an RPL balance by force'));


        // TODO: implement RPD contracts & system
        it(printTitle('owner', 'cannot upgrade a contract with an RPD balance'));
        it(printTitle('owner', 'can upgrade a contract with an RPD balance by force'));


        // Non-owner cannot upgrade a regular contract
        it(printTitle('non owner', 'cannot upgrade a regular contract'), async () => {

            // Upgrade rocketPIP contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketPIP',
                upgradedContractAddress: rocketPIPNew.address,
                upgradedContractAbi: compressAbi(rocketPIPNew.abi),
                fromAddress: userFirst,
            }), 'regular contract was upgraded by non owner');

        });


        // Owner can add a contract
        it(printTitle('owner', 'can add a contract'), async () => {

            // Old rocketPIP contract address
            let rocketTestAddressOld = await rocketStorage.getAddress(web3.utils.soliditySha3('contract.name', 'rocketTest1'));

            // Add test method to abi
            let rocketPIPNewAbi = rocketPIPNew.abi.slice();
            rocketPIPNewAbi.push({
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
                contractAddress: rocketPIPNew.address,
                contractAbi: compressAbi(rocketPIPNewAbi),
                fromAddress: owner,
            });

            // New rocketPIP contract address and ABI
            let rocketTestAddressNew = await rocketStorage.getAddress(web3.utils.soliditySha3('contract.name', 'rocketTest1'));
            let rocketTestAbiNew = await rocketStorage.getString(web3.utils.soliditySha3('contract.abi', 'rocketTest1'));

            // Initialise new RocketPIP contract from stored data
            let rocketTestContract = new web3.eth.Contract(decompressAbi(rocketTestAbiNew), rocketTestAddressNew);

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
                contractAbi: compressAbi(rocketPIPNew.abi),
                fromAddress: owner,
            }), 'contract with a null address was added');

        });


        // Owner cannot add a contract with an existing name
        it(printTitle('owner', 'cannot add a contract with an existing name'), async () => {

            // Add test contract
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest1',
                contractAddress: rocketNodeNew.address,
                contractAbi: compressAbi(rocketNodeNew.abi),
                fromAddress: owner,
            }), 'contract with an existing name was added');

        });


        // Owner cannot add a contract with an existing address
        it(printTitle('owner', 'cannot add a contract with an existing address'), async () => {

            // Add test contract
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest3',
                contractAddress: rocketPIPNew.address,
                contractAbi: compressAbi(rocketPIPNew.abi),
                fromAddress: owner,
            }), 'contract with an existing address was added');

        });


        // Non-owner cannot add a contract
        it(printTitle('non owner', 'cannot add a contract'), async () => {

            // Add rocketTest1 contract
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest4',
                contractAddress: rocketNodeNew.address,
                contractAbi: compressAbi(rocketNodeNew.abi),
                fromAddress: userFirst,
            }), 'contract was added by non owner');

        });


    });

};
