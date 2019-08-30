import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketGroupSettings } from '../_lib/artifacts';
import { createNodeContract } from '../_helpers/rocket-node';
import { createGroupContract } from '../_helpers/rocket-group';
import { scenarioSetNodeTrusted, scenarioSetGroupRocketPoolFeePercent } from './rocket-admin-scenarios';

export default function() {

    contract('RocketAdmin', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const nodeOperator = accounts[1];
        const groupOwner = accounts[2];


        // Setup
        let groupContract;
        before(async () => {

            // Create node contract
            let nodeContract = await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator});

            // Create group contract
            groupContract = await createGroupContract({name: 'Group 1', stakingFee: web3.utils.toWei('0.05', 'ether'), groupOwner});

        });


        // Owner can set a node to trusted
        it(printTitle('owner', 'can set a node to trusted'), async () => {
            await scenarioSetNodeTrusted({
                nodeAddress: nodeOperator,
                trusted: true,
                fromAddress: owner,
                gas: 5000000,
            });
        });


        // Owner cannot set a trusted node to its current status
        it(printTitle('owner', 'cannot set a trusted node to its current status'), async () => {
            await assertThrows(scenarioSetNodeTrusted({
                nodeAddress: nodeOperator,
                trusted: true,
                fromAddress: owner,
                gas: 5000000,
            }), 'Set a trusted node to its current status');
        });


        // Owner can set a node to untrusted
        it(printTitle('owner', 'can set a node to untrusted'), async () => {
            await scenarioSetNodeTrusted({
                nodeAddress: nodeOperator,
                trusted: false,
                fromAddress: owner,
                gas: 5000000,
            });
        });


        // Owner cannot set an untrusted node to its current status
        it(printTitle('owner', 'cannot set an untrusted node to its current status'), async () => {
            await assertThrows(scenarioSetNodeTrusted({
                nodeAddress: nodeOperator,
                trusted: false,
                fromAddress: owner,
                gas: 5000000,
            }), 'Set an untrusted node to its current status');
        });


        // Owner cannot set the trusted status of a nonexistant node
        it(printTitle('owner', 'cannot set the trusted status of a nonexistant node'), async () => {
            await assertThrows(scenarioSetNodeTrusted({
                nodeAddress: accounts[9],
                trusted: true,
                fromAddress: owner,
                gas: 5000000,
            }), 'Set the trusted status of a nonexistant node');
        });


        // Random account cannot set a node's trusted status
        it(printTitle('random account', 'cannot set a node\'s trusted status'), async () => {
            await assertThrows(scenarioSetNodeTrusted({
                nodeAddress: nodeOperator,
                trusted: true,
                fromAddress: accounts[9],
                gas: 5000000,
            }), 'Random account set a node\'s trusted status');
        });


        // Owner can set a group's RP fee percentage
        it(printTitle('owner', 'can set a group\'s RP fee percentage'), async () => {
            await scenarioSetGroupRocketPoolFeePercent({
                groupId: groupContract.address,
                feePerc: web3.utils.toWei('0.01', 'ether'),
                fromAddress: owner,
                gas: 5000000,
            });
        });


        // Owner cannot set the RP fee percentage for an invalid group
        it(printTitle('owner', 'cannot set the RP fee percentage for an invalid group'), async () => {
            await assertThrows(scenarioSetGroupRocketPoolFeePercent({
                groupId: accounts[9],
                feePerc: web3.utils.toWei('0.01', 'ether'),
                fromAddress: owner,
                gas: 5000000,
            }), 'Set the RP fee percentage for an invalid group');
        });


        // Owner cannot set a group's RP fee percentage above the maximum
        it(printTitle('owner', 'cannot set a group\'s RP fee percentage above the maximum'), async () => {
            const rocketGroupSettings = await RocketGroupSettings.deployed();

            // Get maximum fee percentage
            let maxFee = parseInt(await rocketGroupSettings.getMaxFee.call());

            // Get value to set
            let value = web3.utils.toWei('0.9', 'ether');
            assert.isTrue(parseInt(value) > maxFee, 'Pre-check failed: value is below the maximum fee limit');

            // Set group RP fee percentage
            await assertThrows(scenarioSetGroupRocketPoolFeePercent({
                groupId: groupContract.address,
                feePerc: value,
                fromAddress: owner,
                gas: 5000000,
            }), 'Set the RP fee percentage for a group above the maximum');

        });


        // Random account cannot set a group's RP fee percentage
        it(printTitle('random account', 'cannot set a group\'s RP fee percentage'), async () => {
            await assertThrows(scenarioSetGroupRocketPoolFeePercent({
                groupId: groupContract.address,
                feePerc: web3.utils.toWei('0.01', 'ether'),
                fromAddress: accounts[9],
                gas: 5000000,
            }), 'Random account set a group\'s RP fee percentage');
        });


    });

}
