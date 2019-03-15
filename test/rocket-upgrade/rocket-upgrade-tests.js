import { printTitle, assertThrows } from '../_lib/utils/general';
import { compressAbi, decompressAbi } from '../_lib/utils/contract';
import { RocketStorage, RocketBETHToken, RocketDepositAPI, RocketDepositVault, RocketMinipoolInterface, RocketNode, RocketPool, RocketPIP } from '../_lib/artifacts'
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { stakeSingleMinipool } from '../_helpers/rocket-minipool';
import { userDeposit } from '../_helpers/rocket-deposit';
import { mintRpl } from '../_helpers/rocket-pool-token';
import { scenarioUpgradeContract, scenarioAddContract } from './rocket-upgrade-scenarios';

export default function() {

    contract('RocketUpgrade', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const nodeOperator = accounts[2];
        const user1 = accounts[3];


        // Setup
        let rocketStorage;
        let rocketBETHToken;
        let rocketDepositAPI;
        let rocketDepositVault;
        let rocketDepositVaultNew;
        let rocketNode;
        let rocketNodeNew;
        let rocketPool;
        let rocketPoolNew;
        let rocketPIP;
        let rocketPIPNew;
        let groupContract;
        let groupAccessorContract;
        let minipool;
        before(async () => {

            // Initialise contracts
            rocketStorage = await RocketStorage.deployed();
            rocketBETHToken = await RocketBETHToken.deployed();
            rocketDepositAPI = await RocketDepositAPI.deployed();
            rocketDepositVault = await RocketDepositVault.deployed();
            rocketDepositVaultNew = await RocketDepositVault.new(rocketStorage.address, {from: owner});
            rocketNode = await RocketNode.deployed();
            rocketNodeNew = await RocketNode.new(rocketStorage.address, {from: owner});
            rocketPool = await RocketPool.deployed();
            rocketPoolNew = await RocketPool.new(rocketStorage.address, {from: owner});
            rocketPIP = await RocketPIP.deployed();
            rocketPIPNew = await RocketPIP.new(rocketStorage.address, {from: owner});

            // Create group & accessor contracts
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

            // Create node contract & minipool
            let nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator});
            let minipoolAddresses = await createNodeMinipools({nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator, owner});
            minipool = await RocketMinipoolInterface.at(minipoolAddresses[0]);

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


        // Cannot upgrade a contract with an RPL balance
        it(printTitle('owner', 'cannot upgrade a contract with an RPL balance'), async () => {

            // Mint RPL to RocketNode contract
            await mintRpl({toAddress: rocketNode.address, rplAmount: web3.utils.toWei('1', 'ether'), fromAddress: owner});

            // Attempt to upgrade RocketNode contract
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketNode',
                upgradedContractAddress: rocketNodeNew.address,
                upgradedContractAbi: compressAbi(rocketNodeNew.abi),
                fromAddress: owner,
            }), 'Upgraded a contract with an RPL balance');

        });


        // Can upgrade a contract with an RPL balance by force
        it(printTitle('owner', 'can upgrade a contract with an RPL balance by force'), async () => {

            // Upgrade RocketNode contract
            await scenarioUpgradeContract({
                contractName: 'rocketNode',
                upgradedContractAddress: rocketNodeNew.address,
                upgradedContractAbi: compressAbi(rocketNodeNew.abi),
                forceTokens: true,
                fromAddress: owner,
            });

        });


        // Cannot upgrade a contract with an RPB balance
        it(printTitle('owner', 'cannot upgrade a contract with an RPB balance'), async () => {

            // Deposit to minipool
            await userDeposit({depositorContract: groupAccessorContract, durationID: '3m', fromAddress: user1, value: web3.utils.toWei('1', 'ether')});
            let depositID = await rocketDepositAPI.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);

            // Progress minipool to staking
            await stakeSingleMinipool({groupAccessorContract, staker: user1});

            // Withdraw user from minipool while staking to get RPB tokens
            await groupAccessorContract.withdrawDepositMinipoolStaking(depositID, minipool.address, web3.utils.toWei('1', 'ether'), {from: user1, gas: 5000000});

            // Send RPB to RocketPool contract
            await rocketBETHToken.transfer(rocketPool.address, web3.utils.toWei('0.5', 'ether'), {from: user1});

            // Attempt to upgrade RocketPool contract
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketPool',
                upgradedContractAddress: rocketPoolNew.address,
                upgradedContractAbi: compressAbi(rocketPoolNew.abi),
                fromAddress: owner,
            }), 'Upgraded a contract with an RPB balance');

        });


        // Can upgrade a contract with an RPB balance by force
        it(printTitle('owner', 'can upgrade a contract with an RPB balance by force'), async () => {

            // Upgrade RocketPool contract
            await scenarioUpgradeContract({
                contractName: 'rocketPool',
                upgradedContractAddress: rocketPoolNew.address,
                upgradedContractAbi: compressAbi(rocketPoolNew.abi),
                forceTokens: true,
                fromAddress: owner,
            });

        });


        // Cannot upgrade a contract with an ether balance
        it(printTitle('owner', 'cannot upgrade a contract with an ether balance'), async () => {

            // Make user deposit to increase deposit vault balance
            await userDeposit({depositorContract: groupAccessorContract, durationID: '3m', fromAddress: user1, value: web3.utils.toWei('32', 'ether')});

            // Check deposit vault balance
            let depositVaultBalance = parseInt(await web3.eth.getBalance(rocketDepositVault.address));
            assert.isTrue(depositVaultBalance > 0, 'Pre-check failed: RocketDepositVault does not have an ether balance');

            // Attempt to upgrade RocketDepositVault contract
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketDepositVault',
                upgradedContractAddress: rocketDepositVaultNew.address,
                upgradedContractAbi: compressAbi(rocketDepositVault.abi),
                fromAddress: owner,
            }), 'Upgraded a contract with an ether balance');

        });


        // Can upgrade a contract with an ether balance by force
        it(printTitle('owner', 'can upgrade a contract with an ether balance by force'), async () => {

            // Upgrade RocketDepositVault contract
            await scenarioUpgradeContract({
                contractName: 'rocketDepositVault',
                upgradedContractAddress: rocketDepositVaultNew.address,
                upgradedContractAbi: compressAbi(rocketDepositVault.abi),
                forceEther: true,
                fromAddress: owner,
            });

        });


        // Non-owner cannot upgrade a regular contract
        it(printTitle('non owner', 'cannot upgrade a regular contract'), async () => {

            // Upgrade rocketPIP contract address
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketPIP',
                upgradedContractAddress: rocketPIPNew.address,
                upgradedContractAbi: compressAbi(rocketPIPNew.abi),
                fromAddress: user1,
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
                fromAddress: user1,
            }), 'contract was added by non owner');

        });


    });

};
