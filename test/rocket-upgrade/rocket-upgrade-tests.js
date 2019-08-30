import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketStorage, RocketETHToken, RocketDepositIndex, RocketDepositSettings, RocketDepositVault, RocketMinipool, RocketMinipoolInterface, RocketNode, RocketPool, RocketPIP } from '../_lib/artifacts';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { stakeSingleMinipool } from '../_helpers/rocket-minipool';
import { userDeposit } from '../_helpers/rocket-deposit';
import { mintRpl } from '../_helpers/rocket-pool-token';
import { scenarioUpgradeContract, scenarioAddContract, scenarioUpgradeABI, scenarioAddABI, scenarioInitialiseUpgradeApprovers } from './rocket-upgrade-scenarios';

export default function() {

    contract('RocketUpgrade - Upgrades', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const nodeOperator = accounts[2];
        const approver1 = accounts[0];
        const approver2 = accounts[3];
        const approver3 = accounts[4];
        const user1 = accounts[5];


        // Setup
        let rocketStorage;
        let rocketETHToken;
        let rocketDepositIndex;
        let rocketDepositSettings;
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

            // Initialise upgrade approvers
            await scenarioInitialiseUpgradeApprovers({
                approvers: [approver1, approver2, approver3],
                fromAddress: owner,
            });

            // Initialise contracts
            rocketStorage = await RocketStorage.deployed();
            rocketETHToken = await RocketETHToken.deployed();
            rocketDepositIndex = await RocketDepositIndex.deployed();
            rocketDepositSettings = await RocketDepositSettings.deployed();
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


        // Upgrade approver cannot initialise an upgrade to a nonexistent contract
        it(printTitle('upgrade approver', 'cannot initialise an upgrade to a nonexistent contract'), async () => {
            await assertThrows(scenarioUpgradeContract({
                contractName: 'nonexistentContract',
                upgradedContractAddress: rocketPIPNew.address,
                upgradedContractAbi: rocketPIPNew.abi,
                fromAddress: approver1,
            }), 'Initialised an upgrade to a nonexistent contract');
        });


        // Upgrade approver cannot initialise an upgrade to update a contract to its current address
        it(printTitle('upgrade approver', 'cannot initialise an upgrade to update a contract to its current address'), async () => {
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketPIP',
                upgradedContractAddress: rocketPIP.address,
                upgradedContractAbi: rocketPIPNew.abi,
                fromAddress: approver1,
            }), 'Initialised an upgrade to update a contract to its current address');
        });


        // Random account cannot initialise a contract upgrade
        it(printTitle('random account', 'cannot initialise a contract upgrade'), async () => {
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketPIP',
                upgradedContractAddress: rocketPIPNew.address,
                upgradedContractAbi: rocketPIPNew.abi,
                fromAddress: user1,
            }), 'Random account initialised a contract upgrade');
        });


        // Upgrade approver can initialise a contract upgrade
        it(printTitle('upgrade approver', 'can initialise a contract upgrade'), async () => {
            await scenarioUpgradeContract({
                contractName: 'rocketPIP',
                upgradedContractAddress: rocketPIPNew.address,
                upgradedContractAbi: rocketPIPNew.abi,
                fromAddress: approver1,
            });
        });


        // Upgrade approver cannot complete their own contract upgrade
        it(printTitle('upgrade approver', 'cannot complete their own contract upgrade'), async () => {
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketPIP',
                upgradedContractAddress: rocketPIPNew.address,
                upgradedContractAbi: rocketPIPNew.abi,
                fromAddress: approver1,
            }), 'Approver completed their own contract upgrade');
        });


        // Upgrade approver can complete another approver's contract upgrade
        it(printTitle('upgrade approver', 'can complete another approver\'s contract upgrade'), async () => {
            await scenarioUpgradeContract({
                contractName: 'rocketPIP',
                upgradedContractAddress: rocketPIPNew.address,
                upgradedContractAbi: rocketPIPNew.abi,
                fromAddress: approver2,
            });
        });


        // Upgrade approver cannot upgrade a contract with an RPL balance
        it(printTitle('upgrade approver', 'cannot upgrade a contract with an RPL balance'), async () => {

            // Mint RPL to RocketNode contract
            await mintRpl({toAddress: rocketNode.address, rplAmount: web3.utils.toWei('1', 'ether'), fromAddress: owner});

            // Attempt to upgrade RocketNode contract
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketNode',
                upgradedContractAddress: rocketNodeNew.address,
                upgradedContractAbi: rocketNodeNew.abi,
                fromAddress: approver1,
            }), 'Upgraded a contract with an RPL balance');

        });


        // Upgrade approver can upgrade a contract with an RPL balance by force
        it(printTitle('upgrade approver', 'can upgrade a contract with an RPL balance by force'), async () => {

            // Upgrade RocketNode contract
            await scenarioUpgradeContract({
                contractName: 'rocketNode',
                upgradedContractAddress: rocketNodeNew.address,
                upgradedContractAbi: rocketNodeNew.abi,
                forceTokens: true,
                fromAddress: approver1,
            });
            await scenarioUpgradeContract({
                contractName: 'rocketNode',
                upgradedContractAddress: rocketNodeNew.address,
                upgradedContractAbi: rocketNodeNew.abi,
                forceTokens: true,
                fromAddress: approver2,
            });

        });


        // Upgrade approver cannot upgrade a contract with an rETH balance
        it(printTitle('upgrade approver', 'cannot upgrade a contract with an rETH balance'), async () => {

            // Deposit to minipool
            await userDeposit({depositorContract: groupAccessorContract, durationID: '3m', fromAddress: user1, value: web3.utils.toWei('1', 'ether')});
            let depositID = await rocketDepositIndex.getUserQueuedDepositAt.call(groupContract.address, user1, '3m', 0);

            // Progress minipool to staking
            await stakeSingleMinipool({groupAccessorContract, staker: user1});

            // Withdraw user from minipool while staking to get rETH tokens
            await rocketDepositSettings.setStakingWithdrawalAllowed(true, {from: owner, gas: 500000});
            await groupAccessorContract.depositWithdrawMinipoolStaking(depositID, minipool.address, web3.utils.toWei('1', 'ether'), {from: user1, gas: 5000000});
            await rocketDepositSettings.setStakingWithdrawalAllowed(false, {from: owner, gas: 500000});

            // Send rETH to RocketPool contract
            await rocketETHToken.transfer(rocketPool.address, web3.utils.toWei('0.5', 'ether'), {from: user1});

            // Attempt to upgrade RocketPool contract
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketPool',
                upgradedContractAddress: rocketPoolNew.address,
                upgradedContractAbi: rocketPoolNew.abi,
                fromAddress: approver1,
            }), 'Upgraded a contract with an rETH balance');

        });


        // Upgrade approver can upgrade a contract with an rETH balance by force
        it(printTitle('upgrade approver', 'can upgrade a contract with an rETH balance by force'), async () => {

            // Upgrade RocketPool contract
            await scenarioUpgradeContract({
                contractName: 'rocketPool',
                upgradedContractAddress: rocketPoolNew.address,
                upgradedContractAbi: rocketPoolNew.abi,
                forceTokens: true,
                fromAddress: approver1,
            });
            await scenarioUpgradeContract({
                contractName: 'rocketPool',
                upgradedContractAddress: rocketPoolNew.address,
                upgradedContractAbi: rocketPoolNew.abi,
                forceTokens: true,
                fromAddress: approver2,
            });

        });


        // Upgrade approver cannot upgrade a contract with an ether balance
        it(printTitle('upgrade approver', 'cannot upgrade a contract with an ether balance'), async () => {

            // Make user deposit to increase deposit vault balance
            await userDeposit({depositorContract: groupAccessorContract, durationID: '3m', fromAddress: user1, value: web3.utils.toWei('32', 'ether')});

            // Check deposit vault balance
            let depositVaultBalance = parseInt(await web3.eth.getBalance(rocketDepositVault.address));
            assert.isTrue(depositVaultBalance > 0, 'Pre-check failed: RocketDepositVault does not have an ether balance');

            // Attempt to upgrade RocketDepositVault contract
            await assertThrows(scenarioUpgradeContract({
                contractName: 'rocketDepositVault',
                upgradedContractAddress: rocketDepositVaultNew.address,
                upgradedContractAbi: rocketDepositVault.abi,
                fromAddress: approver1,
            }), 'Upgraded a contract with an ether balance');

        });


        // Upgrade approver can upgrade a contract with an ether balance by force
        it(printTitle('upgrade approver', 'can upgrade a contract with an ether balance by force'), async () => {

            // Upgrade RocketDepositVault contract
            await scenarioUpgradeContract({
                contractName: 'rocketDepositVault',
                upgradedContractAddress: rocketDepositVaultNew.address,
                upgradedContractAbi: rocketDepositVault.abi,
                forceEther: true,
                fromAddress: approver1,
            });
            await scenarioUpgradeContract({
                contractName: 'rocketDepositVault',
                upgradedContractAddress: rocketDepositVaultNew.address,
                upgradedContractAbi: rocketDepositVault.abi,
                forceEther: true,
                fromAddress: approver2,
            });

        });


        // Upgrade approver can add a contract
        it(printTitle('upgrade approver', 'can add a contract'), async () => {
            await scenarioAddContract({
                contractName: 'rocketTest1',
                contractAddress: accounts[8],
                contractAbi: rocketPIP.abi,
                fromAddress: approver1,
            });
        });


        // Upgrade approver cannot add a contract with a null address
        it(printTitle('upgrade approver', 'cannot add a contract with a null address'), async () => {
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest2',
                contractAddress: '0x0000000000000000000000000000000000000000',
                contractAbi: rocketPIP.abi,
                fromAddress: approver1,
            }), 'Added a contract with a null address');
        });


        // Upgrade approver cannot add a contract with an existing name
        it(printTitle('upgrade approver', 'cannot add a contract with an existing name'), async () => {
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest1',
                contractAddress: accounts[9],
                contractAbi: rocketPIP.abi,
                fromAddress: approver1,
            }), 'Added a contract with an existing name');
        });


        // Upgrade approver cannot add a contract with an existing address
        it(printTitle('upgrade approver', 'cannot add a contract with an existing address'), async () => {
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest2',
                contractAddress: accounts[8],
                contractAbi: rocketPIP.abi,
                fromAddress: approver1,
            }), 'Added a contract with an existing address');
        });


        // Upgrade approver cannot add a contract with a name in use by an ABI
        it(printTitle('upgrade approver', 'cannot add a contract with a name in use by an ABI'), async () => {
            await assertThrows(scenarioAddContract({
                contractName: 'rocketMinipool',
                contractAddress: accounts[9],
                contractAbi: rocketPIP.abi,
                fromAddress: approver1,
            }), 'Added a contract with a name in use by an ABI');
        });


        // Random account cannot add a contract
        it(printTitle('random account', 'cannot add a contract'), async () => {
            await assertThrows(scenarioAddContract({
                contractName: 'rocketTest2',
                contractAddress: accounts[9],
                contractAbi: rocketPIP.abi,
                fromAddress: user1,
            }), 'Random account added a contract');
        });


        // Upgrade approver cannot initialise an upgrade to a nonexistent ABI
        it(printTitle('upgrade approver', 'cannot initialise an upgrade to a nonexistent ABI'), async () => {
            await assertThrows(scenarioUpgradeABI({
                contractName: 'nonexistentContract',
                upgradedContractAbi: RocketMinipool.abi,
                fromAddress: approver1,
            }), 'Initialised an upgrade to a nonexistent ABI');
        });


        // Upgrade approver cannot initialise an upgrade to a stored contract's ABI
        it(printTitle('upgrade approver', 'cannot initialise an upgrade to a stored contract\'s ABI'), async () => {
            await assertThrows(scenarioUpgradeABI({
                contractName: 'rocketPool',
                upgradedContractAbi: RocketMinipool.abi,
                fromAddress: approver1,
            }), 'Initialised an upgrade to a stored contract\'s ABI');
        });


        // Random account cannot initialise an ABI upgrade
        it(printTitle('random account', 'cannot initialise an ABI upgrade'), async () => {
            await assertThrows(scenarioUpgradeABI({
                contractName: 'rocketMinipool',
                upgradedContractAbi: RocketMinipool.abi,
                fromAddress: user1,
            }), 'Random account initialised an ABI upgrade');
        });


        // Upgrade approver can initialise an ABI upgrade
        it(printTitle('upgrade approver', 'can initialise an ABI upgrade'), async () => {
            await scenarioUpgradeABI({
                contractName: 'rocketMinipool',
                upgradedContractAbi: RocketMinipool.abi,
                fromAddress: approver1,
            });
        });


        // Upgrade approver cannot complete their own ABI upgrade
        it(printTitle('upgrade approver', 'cannot complete their own ABI upgrade'), async () => {
            await assertThrows(scenarioUpgradeABI({
                contractName: 'rocketMinipool',
                upgradedContractAbi: RocketMinipool.abi,
                fromAddress: approver1,
            }), 'Approver completed their own ABI upgrade');
        });


        // Upgrade approver can complete another approver's ABI upgrade
        it(printTitle('upgrade approver', 'can complete another approver\'s ABI upgrade'), async () => {
            await scenarioUpgradeABI({
                contractName: 'rocketMinipool',
                upgradedContractAbi: RocketMinipool.abi,
                fromAddress: approver2,
            });
        });


        // Upgrade approver can add an ABI
        it(printTitle('upgrade approver', 'can add an ABI'), async () => {
            await scenarioAddABI({
                contractName: 'rocketABITest1',
                contractAbi: rocketPIP.abi,
                fromAddress: approver1,
            });
        });


        // Upgrade approver cannot add an ABI with an existing name
        it(printTitle('upgrade approver', 'cannot add an ABI with an existing name'), async () => {
            await assertThrows(scenarioAddABI({
                contractName: 'rocketABITest1',
                contractAbi: rocketPIP.abi,
                fromAddress: approver1,
            }), 'Added an ABI with an existing name');
        });


        // Upgrade approver cannot add an ABI with a name in use by a stored contract
        it(printTitle('upgrade approver', 'cannot add an ABI with a name in use by a stored contract'), async () => {
            await assertThrows(scenarioAddABI({
                contractName: 'rocketPool',
                contractAbi: rocketPIP.abi,
                fromAddress: approver1,
            }), 'Added an ABI with a name in use by a stored contract');
        });


        // Random account cannot add an ABI
        it(printTitle('random account', 'cannot add an ABI'), async () => {
            await assertThrows(scenarioAddABI({
                contractName: 'rocketABITest2',
                contractAbi: rocketPIP.abi,
                fromAddress: user1,
            }), 'Random account added an ABI');
        });


    });

};
