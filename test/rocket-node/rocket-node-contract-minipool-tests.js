import { printTitle, assertThrows } from '../_lib/utils/general';
import { getValidatorPubkey } from '../_lib/utils/beacon';
import { RocketMinipool, RocketMinipoolSettings, RocketNodeAPI } from '../_lib/artifacts';
import { setRocketPoolWithdrawalKey, userDeposit } from '../_helpers/rocket-deposit';
import { createGroupContract, createGroupAccessorContract, addGroupAccessor } from '../_helpers/rocket-group';
import { createNodeContract, createNodeMinipools } from '../_helpers/rocket-node';
import { scenarioStakeMinipool } from './rocket-node-contract-scenarios';

export default function() {

    contract('RocketNodeContract - Minipools', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const operator = accounts[1];
        const operator2 = accounts[2];
        const groupOwner = accounts[3];
        const staker = accounts[4];
        const withdrawalKeyOperator = accounts[5];


        // Setup
        let nodeContract;
        let nodeContract2;
        let validatorPubkey;
        let withdrawalCredentials;
        let node1FilledMinipoolAddresses;
        let node2FilledMinipoolAddresses;
        let node1EmptyMinipoolAddresses;
        before(async () => {

            // Get minipool launch & deposit amounts
            let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
            let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
            let depositAmount = Math.floor(miniPoolLaunchAmount / 4);

            // Create node contracts
            nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: operator});
            nodeContract2 = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: operator2});

            // Initialise validator pubkey
            validatorPubkey = getValidatorPubkey();

            // Create group contract
            let groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

            // Create and add group accessor contract
            let groupAccessorContract = await createGroupAccessorContract({groupContractAddress: groupContract.address, groupOwner});
            await addGroupAccessor({groupContract, groupAccessorContractAddress: groupAccessorContract.address, groupOwner});

            // Create and fill minipools
            node1FilledMinipoolAddresses = await createNodeMinipools({nodeContract: nodeContract, stakingDurationID: '3m', minipoolCount: 2, nodeOperator: operator, owner});
            node2FilledMinipoolAddresses = await createNodeMinipools({nodeContract: nodeContract2, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator2, owner});
            for (let di = 0; di < 6; ++di) {
                await userDeposit({depositorContract: groupAccessorContract, durationID: '3m', fromAddress: staker, value: depositAmount});
            }

            // Create empty minipools
            node1EmptyMinipoolAddresses = await createNodeMinipools({nodeContract: nodeContract, stakingDurationID: '3m', minipoolCount: 1, nodeOperator: operator, owner});

        });


        // Node operator cannot stake a minipool before RP withdrawal credentials are initialized
        it(printTitle('node operator', 'cannot stake a minipool before RP withdrawal credentials are initialized'), async () => {
            await assertThrows(scenarioStakeMinipool({
                nodeContract: nodeContract,
                minipoolAddress: node1FilledMinipoolAddresses[0],
                validatorPubkey: validatorPubkey,
                withdrawalCredentials: '0x0000000000000000000000000000000000000000000000000000000000000000',
                fromAddress: operator,
                gas: 8000000,
            }), 'Node operator staked a minipool before RP withdrawal credentials were initialized');
        });


        // Initialize RP withdrawal credentials
        it(printTitle('-----', 'initialize Rocket Pool withdrawal credentials'), async () => {

            // Set
            await setRocketPoolWithdrawalKey({nodeOperator: withdrawalKeyOperator, owner});

            // Get
            let rocketNodeAPI = await RocketNodeAPI.deployed();
            withdrawalCredentials = await rocketNodeAPI.getWithdrawalCredentials.call();

        });


        // Node operator cannot stake a minipool that is not in prelaunch
        it(printTitle('node operator', 'cannot stake a minipool that is not in prelaunch'), async () => {

            // Check minipool status
            let minipoolAddress = node1EmptyMinipoolAddresses[0];
            let minipool = await RocketMinipool.at(minipoolAddress);
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 0, 'Pre-check failed: minipool is not at Initialized status');

            // Stake minipool
            await assertThrows(scenarioStakeMinipool({
                nodeContract: nodeContract,
                minipoolAddress: minipoolAddress,
                validatorPubkey: validatorPubkey,
                withdrawalCredentials: withdrawalCredentials,
                fromAddress: operator,
                gas: 8000000,
            }), 'Node operator staked a minipool that was not in prelaunch');

        });


        // Node operator cannot stake a minipool with invalid withdrawal credentials
        it(printTitle('node operator', 'cannot stake a minipool with invalid withdrawal credentials'), async () => {

            // Check minipool status
            let minipoolAddress = node1FilledMinipoolAddresses[0];
            let minipool = await RocketMinipool.at(minipoolAddress);
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 2, 'Pre-check failed: minipool is not at PreLaunch status');

            // Stake minipool
            await assertThrows(scenarioStakeMinipool({
                nodeContract: nodeContract,
                minipoolAddress: minipoolAddress,
                validatorPubkey: validatorPubkey,
                withdrawalCredentials: '0x1111111111111111111111111111111111111111111111111111111111111111',
                fromAddress: operator,
                gas: 8000000,
            }), 'Node operator staked a minipool with invalid withdrawal credentials');

        });


        // Node operator can stake a minipool
        it(printTitle('node operator', 'can stake a minipool'), async () => {

            // Check minipool status
            let minipoolAddress = node1FilledMinipoolAddresses[0];
            let minipool = await RocketMinipool.at(minipoolAddress);
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 2, 'Pre-check failed: minipool is not at PreLaunch status');

            // Stake minipool
            await scenarioStakeMinipool({
                nodeContract: nodeContract,
                minipoolAddress: minipoolAddress,
                validatorPubkey: validatorPubkey,
                withdrawalCredentials: withdrawalCredentials,
                fromAddress: operator,
                gas: 8000000,
            });

        });


        // Node operator cannot stake a minipool re-using a validator pubkey
        it(printTitle('node operator', 'cannot stake a minipool re-using a validator pubkey'), async () => {

            // Check minipool status
            let minipoolAddress = node1FilledMinipoolAddresses[1];
            let minipool = await RocketMinipool.at(minipoolAddress);
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 2, 'Pre-check failed: minipool is not at PreLaunch status');

            // Stake minipool
            await assertThrows(scenarioStakeMinipool({
                nodeContract: nodeContract,
                minipoolAddress: minipoolAddress,
                validatorPubkey: validatorPubkey,
                withdrawalCredentials: withdrawalCredentials,
                fromAddress: operator,
                gas: 8000000,
            }), 'Node operator staked a minipool re-using a validator pubkey');

        });


        // Node operator cannot stake another node's minipool
        it(printTitle('node operator', 'cannot stake another node\'s minipool'), async () => {

            // Check minipool status
            let minipoolAddress = node2FilledMinipoolAddresses[0];
            let minipool = await RocketMinipool.at(minipoolAddress);
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 2, 'Pre-check failed: minipool is not at PreLaunch status');

            // Stake minipool
            await assertThrows(scenarioStakeMinipool({
                nodeContract: nodeContract,
                minipoolAddress: minipoolAddress,
                validatorPubkey: getValidatorPubkey(),
                withdrawalCredentials: withdrawalCredentials,
                fromAddress: operator,
                gas: 8000000,
            }), 'Node operator staked another node\'s minipool');

        });


        // Random account cannot stake a minipool
        it(printTitle('random account', 'cannot stake a minipool'), async () => {

            // Check minipool status
            let minipoolAddress = node2FilledMinipoolAddresses[0];
            let minipool = await RocketMinipool.at(minipoolAddress);
            let status = parseInt(await minipool.getStatus.call());
            assert.equal(status, 2, 'Pre-check failed: minipool is not at PreLaunch status');

            // Stake minipool
            await assertThrows(scenarioStakeMinipool({
                nodeContract: nodeContract2,
                minipoolAddress: minipoolAddress,
                validatorPubkey: getValidatorPubkey(),
                withdrawalCredentials: withdrawalCredentials,
                fromAddress: staker,
                gas: 8000000,
            }), 'Random account staked a minipool');

        });


    });

};
