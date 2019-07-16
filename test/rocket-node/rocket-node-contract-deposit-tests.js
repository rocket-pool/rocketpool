import { printTitle, assertThrows } from '../_lib/utils/general';
import { getValidatorPubkey, getValidatorSignature } from '../_lib/utils/beacon';
import { RocketDepositSettings, RocketMinipoolSettings, RocketNodeAPI, RocketNodeSettings, RocketPool } from '../_lib/artifacts';
import { userDeposit } from '../_helpers/rocket-deposit';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract } from '../_helpers/rocket-node';
import { mintRpl } from '../_helpers/rocket-pool-token';
import { scenarioDepositReserve, scenarioDepositReserveCancel, scenarioDeposit, scenarioWithdrawNodeEther, scenarioWithdrawNodeRpl, scenarioAPIDeposit } from './rocket-node-contract-scenarios';

export default function() {

    contract('RocketNodeContract - Deposits', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const operator = accounts[1];
        const operator2 = accounts[2];
        const groupOwner = accounts[3];
        const staker = accounts[4];


        // Setup
        let rocketNodeAPI;
        let rocketNodeSettings;
        let rocketMinipoolSettings;
        let rocketPool;
        let nodeContract;
        let groupContract;
        let groupAccessorContract;
        let depositAmount;
        let chunkSize;
        before(async () => {

            // Initialise contracts
            rocketNodeAPI = await RocketNodeAPI.deployed();
            rocketNodeSettings = await RocketNodeSettings.deployed();
            rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
            rocketPool = await RocketPool.deployed();

            // Create node contract
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: operator});
            await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: operator2});

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

            // Get minipool launch & deposit amounts
            let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
            depositAmount = Math.floor(miniPoolLaunchAmount / 2);

            // Get deposit settings
            let rocketDepositSettings = await RocketDepositSettings.deployed();
            chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());

        });


        // Random account cannot reserve a deposit
        it(printTitle('random account', 'cannot reserve a deposit'), async () => {
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                durationID: '3m',
                validatorPubkey: getValidatorPubkey(),
                validatorSignature: getValidatorSignature(),
                fromAddress: operator2,
            }), 'Random account reserved a deposit');
        });


        // Node operator cannot reserve a deposit with an invalid staking duration ID
        it(printTitle('node operator', 'cannot reserve a deposit with an invalid staking duration ID'), async () => {
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                durationID: 'beer',
                validatorPubkey: getValidatorPubkey(),
                validatorSignature: getValidatorSignature(),
                fromAddress: operator,
            }), 'Reserved a deposit with an invalid staking duration ID');
        });


        // Node operator cannot reserve a deposit while deposits are disabled
        it(printTitle('node operator', 'cannot reserve a deposit while deposits are disabled'), async () => {

            // Disable deposits
            await rocketNodeSettings.setDepositAllowed(false, {from: owner});

            // Reserve deposit
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                durationID: '3m',
                validatorPubkey: getValidatorPubkey(),
                validatorSignature: getValidatorSignature(),
                fromAddress: operator,
            }), 'Reserved a deposit while deposits are disabled');

            // Re-enable deposits
            await rocketNodeSettings.setDepositAllowed(true, {from: owner});

        });


        // Node operator cannot reserve a deposit with a used validator pubkey
        it(printTitle('node operator', 'cannot reserve a deposit with a used validator pubkey'), async () => {

            // Reserve and complete deposit
            await scenarioDepositReserve({
                nodeContract,
                durationID: '6m',
                validatorPubkey: Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex'),
                validatorSignature: getValidatorSignature(),
                fromAddress: operator,
            });
            await scenarioDeposit({
                nodeContract,
                value: depositAmount,
                fromAddress: accounts[2], // Allowed from any address
            });

            // Attempt to reserve deposit with used pubkey
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                durationID: '6m',
                validatorPubkey: Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex'),
                validatorSignature: getValidatorSignature(),
                fromAddress: operator,
            }), 'Reserved a deposit with a used validator pubkey');

        });


        // Node operator can reserve a deposit
        it(printTitle('node operator', 'can reserve a deposit'), async () => {
            await scenarioDepositReserve({
                nodeContract,
                durationID: '3m',
                validatorPubkey: getValidatorPubkey(),
                validatorSignature: getValidatorSignature(),
                fromAddress: operator,
            });
        });


        // Node operator cannot reserve multiple simultaneous deposits
        it(printTitle('node operator', 'cannot reserve multiple simultaneous deposits'), async () => {
            await assertThrows(scenarioDepositReserve({
                nodeContract,
                durationID: '3m',
                validatorPubkey: getValidatorPubkey(),
                validatorSignature: getValidatorSignature(),
                fromAddress: operator,
            }), 'Reserved multiple simultaneous deposits');
        });


        // Random account cannot cancel a deposit reservation
        it(printTitle('random account', 'cannot cancel a deposit reservation'), async () => {
            await assertThrows(scenarioDepositReserveCancel({
                nodeContract,
                fromAddress: accounts[2],
                gas: 5000000,
            }), 'Random account cancelled a deposit reservation');
        });


        // Node operator can cancel a deposit reservation
        it(printTitle('node operator', 'can cancel a deposit reservation'), async () => {
            await scenarioDepositReserveCancel({
                nodeContract,
                fromAddress: operator,
                gas: 5000000,
            });
        });


        // Node operator cannot cancel a nonexistant deposit reservation
        it(printTitle('node operator', 'cannot cancel a nonexistant deposit reservation'), async () => {
            await assertThrows(scenarioDepositReserveCancel({
                nodeContract,
                fromAddress: operator,
                gas: 5000000,
            }), 'Cancelled a nonexistant deposit reservation');
        });


        // Node operator cannot deposit without a reservation
        it(printTitle('node operator', 'cannot deposit without a reservation'), async () => {

            // Attempt deposit
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: depositAmount,
                fromAddress: operator,
            }), 'Deposited without a reservation');

            // Reserve deposit
            await scenarioDepositReserve({
                nodeContract,
                durationID: '3m',
                validatorPubkey: getValidatorPubkey(),
                validatorSignature: getValidatorSignature(),
                fromAddress: operator,
            });

        });


        // Node operator cannot deposit with insufficient ether
        it(printTitle('node operator', 'cannot deposit with insufficient ether'), async () => {
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: Math.floor(depositAmount / 2),
                fromAddress: operator,
            }), 'Deposited with insufficient ether');
        });


        // Node operator cannot deposit while deposits are disabled
        it(printTitle('node operator', 'cannot deposit while deposits are disabled'), async () => {

            // Disable deposits
            await rocketNodeSettings.setDepositAllowed(false, {from: owner});

            // Deposit
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: depositAmount,
                fromAddress: operator,
            }), 'Deposited while deposits are disabled');

            // Re-enable deposits
            await rocketNodeSettings.setDepositAllowed(true, {from: owner});

        });


        // Node operator cannot deposit while minipool creation is disabled
        it(printTitle('node operator', 'cannot deposit while minipool creation is disabled'), async () => {

            // Disable deposits
            await rocketMinipoolSettings.setMinipoolNewEnabled(false, {from: owner});

            // Deposit
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: depositAmount,
                fromAddress: operator,
            }), 'Deposited while minipool creation was disabled');

            // Re-enable deposits
            await rocketMinipoolSettings.setMinipoolNewEnabled(true, {from: owner});

        });


        // Node operator cannot call API deposit method directly
        it(printTitle('node operator', 'cannot call API deposit method directly'), async () => {
            await assertThrows(scenarioAPIDeposit({
                nodeOperator: operator,
            }), 'Called API deposit method directly');
        });


        // Node operator can deposit with no RPL required
        it(printTitle('node operator', 'can deposit with no RPL required'), async () => {

            // Get required RPL amount
            let rplRequired = await nodeContract.getDepositReserveRPLRequired.call();
            assert.equal(rplRequired, 0, 'Pre-check failed: required RPL amount for initial minipools is not 0');

            // Deposit to create initial minipools
            await scenarioDeposit({
                nodeContract,
                value: depositAmount,
                fromAddress: accounts[2], // Allowed from any address
            });

            // Perform user deposits to assign ether & lower RPL ratio from maximum to 0
            let chunksToAssign = depositAmount / chunkSize;
            for (let di = 0; di <= chunksToAssign; ++di) {

                // Get network utilisation & RPL ratio
                let networkUtilisation = parseFloat(web3.utils.fromWei(await rocketPool.getNetworkUtilisation.call('3m'), 'ether'));
                let rplRatio = parseFloat(web3.utils.fromWei(await rocketNodeAPI.getRPLRatio.call('3m'), 'ether'));

                // Check RPL ratio based on network utilisation
                switch (networkUtilisation) {
                    case 0.000: assert.isTrue(rplRatio > 2.9 && rplRatio < 3.0, 'Incorrect RPL ratio'); break;
                    case 0.125: assert.isTrue(rplRatio > 1.4 && rplRatio < 1.5, 'Incorrect RPL ratio'); break;
                    case 0.250: assert.isTrue(rplRatio > 1.0 && rplRatio < 1.1, 'Incorrect RPL ratio'); break;
                    case 0.375: assert.isTrue(rplRatio > 1.0 && rplRatio < 1.1, 'Incorrect RPL ratio'); break;
                    case 0.500: assert.isTrue(rplRatio == 1,                    'Incorrect RPL ratio'); break;
                    case 0.625: assert.isTrue(rplRatio > 0.9 && rplRatio < 1.0, 'Incorrect RPL ratio'); break;
                    case 0.750: assert.isTrue(rplRatio > 0.8 && rplRatio < 0.9, 'Incorrect RPL ratio'); break;
                    case 0.875: assert.isTrue(rplRatio > 0.5 && rplRatio < 0.6, 'Incorrect RPL ratio'); break;
                    case 1.000: assert.isTrue(rplRatio == 0,                    'Incorrect RPL ratio'); break;
                }

                // Perform user deposit
                if (di < chunksToAssign) {
                    await userDeposit({
                        depositorContract: groupAccessorContract,
                        durationID: '3m',
                        fromAddress: staker,
                        value: chunkSize,
                    });
                }

            }

            // Make node deposit to create more minipools and raise RPL ratio above 0
            await scenarioDepositReserve({
                nodeContract,
                durationID: '3m',
                validatorPubkey: getValidatorPubkey(),
                validatorSignature: getValidatorSignature(),
                fromAddress: operator,
            });
            await scenarioDeposit({
                nodeContract,
                value: depositAmount,
                fromAddress: accounts[2], // Allowed from any address
            });

        });


        // Node operator cannot deposit without depositing required RPL
        it(printTitle('node operator', 'cannot deposit without required RPL'), async () => {

            // Reserve deposit
            await scenarioDepositReserve({
                nodeContract,
                durationID: '3m',
                validatorPubkey: getValidatorPubkey(),
                validatorSignature: getValidatorSignature(),
                fromAddress: operator,
            });

            // Get required RPL amount
            let rplRequired = await nodeContract.getDepositReserveRPLRequired.call();
            assert.isTrue(rplRequired > 0, 'Pre-check failed: required RPL amount is 0');

            // Attempt deposit
            await assertThrows(scenarioDeposit({
                nodeContract,
                value: depositAmount,
                fromAddress: operator,
            }), 'Deposited without paying required RPL');

        });


        // Node operator can deposit after depositing required RPL
        it(printTitle('node operator', 'can deposit with required RPL'), async () => {

            // Get required RPL amount
            let rplRequired = await nodeContract.getDepositReserveRPLRequired.call();
            assert.isTrue(rplRequired > 0, 'Pre-check failed: required RPL amount is 0');

            // Deposit required RPL
            await mintRpl({
                toAddress: nodeContract.address,
                rplAmount: rplRequired,
                fromAddress: owner,
            });

            // Deposit
            await scenarioDeposit({
                nodeContract,
                value: depositAmount,
                fromAddress: accounts[2], // Allowed from any address
            });

        });


        // Node operator can withdraw deposited ether from node contract
        it(printTitle('node operator', 'can withdraw deposited ether from node contract'), async () => {

            // Deposit ether
            await web3.eth.sendTransaction({
                from: operator,
                to: nodeContract.address,
                value: web3.utils.toWei('1', 'ether'),
                gas: 5000000,
            });

            // Withdraw ether
            await scenarioWithdrawNodeEther({
                nodeContract,
                amount: web3.utils.toWei('1', 'ether'),
                fromAddress: operator,
                gas: 5000000,
            });

        });


        // Node operator cannot withdraw more ether from node contract than its balance
        it(printTitle('node operator', 'cannot withdraw more ether from node contract than its balance'), async () => {

            // Get node contract balance & withdrawal amount
            let balance = parseInt(await nodeContract.getBalanceETH.call());
            let withdrawAmount = balance + parseInt(web3.utils.toWei('1', 'ether'));

            // Attempt withdrawal
            await assertThrows(scenarioWithdrawNodeEther({
                nodeContract,
                // TODO: Remove hex encoding when web3 AbiCoder bug is fixed
                amount: web3.utils.numberToHex(withdrawAmount),
                fromAddress: operator,
                gas: 5000000,
            }), 'Withdrew more ether from node contract than its balance');

        });


        // Random account cannot withdraw deposited ether from node contract
        it(printTitle('random account', 'cannot withdraw deposited ether from node contract'), async () => {

            // Deposit ether
            await web3.eth.sendTransaction({
                from: operator,
                to: nodeContract.address,
                value: web3.utils.toWei('1', 'ether'),
                gas: 5000000,
            });

            // Attempt withdrawal
            await assertThrows(scenarioWithdrawNodeEther({
                nodeContract,
                amount: web3.utils.toWei('1', 'ether'),
                fromAddress: accounts[9],
                gas: 5000000,
            }), 'Random account withdrew ether from node contract');

        });


        // Node operator can withdraw deposited RPL from node contract
        it(printTitle('node operator', 'can withdraw deposited RPL from node contract'), async () => {

            // Deposit RPL
            await mintRpl({
                toAddress: nodeContract.address,
                rplAmount: web3.utils.toWei('1', 'ether'),
                fromAddress: owner,
                gas: 5000000,
            });

            // Withdraw RPL
            await scenarioWithdrawNodeRpl({
                nodeContract,
                amount: web3.utils.toWei('1', 'ether'),
                fromAddress: operator,
                gas: 5000000,
            });

        });


        // Node operator cannot withdraw more RPL from node contract than its balance
        it(printTitle('node operator', 'cannot withdraw more RPL from node contract than its balance'), async () => {

            // Get node contract balance & withdrawal amount
            let balance = parseInt(await nodeContract.getBalanceRPL.call());
            let withdrawAmount = balance + parseInt(web3.utils.toWei('1', 'ether'));

            // Attempt withdrawal
            await assertThrows(scenarioWithdrawNodeRpl({
                nodeContract,
                amount: web3.utils.numberToHex(withdrawAmount),
                fromAddress: operator,
                gas: 5000000,
            }), 'Withdrew more RPL from node contract than its balance');

        });


        // Random account cannot withdraw deposited RPL from node contract
        it(printTitle('random account', 'cannot withdraw deposited RPL from node contract'), async () => {

            // Deposit RPL
            await mintRpl({
                toAddress: nodeContract.address,
                rplAmount: web3.utils.toWei('1', 'ether'),
                fromAddress: owner,
                gas: 5000000,
            });

            // Attempt withdrawal
            await assertThrows(scenarioWithdrawNodeRpl({
                nodeContract,
                amount: web3.utils.toWei('1', 'ether'),
                fromAddress: accounts[9],
                gas: 5000000,
            }), 'Random account withdrew RPL from node contract');

        });


    });

};
