import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketGroupSettings } from '../_lib/artifacts';
import { scenarioAddGroup, scenarioCreateDefaultGroupAccessor } from './rocket-group-api-scenarios';

export default function() {

    contract('RocketGroupAPI', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];
        const groupAdmin = accounts[2];


        // Group
        let groupID;


        // Setup
        let rocketGroupSettings;
        let newGroupFee;
        before(async () => {

            // Get contracts
            rocketGroupSettings = await RocketGroupSettings.deployed();

            // Get new group fee
            newGroupFee = parseInt(await rocketGroupSettings.getNewFee());

        });


        // Group owner can add a group
        it(printTitle('group owner', 'can add a group'), async () => {

            // Set registration fee to zero
            await rocketGroupSettings.setNewFee(0, {from: owner, gas: 500000});

            // Zero registration fee
            groupID = await scenarioAddGroup({
                name: 'Group 0',
                stakingFee: web3.utils.toWei('0.05', 'ether'),
                value: 0,
                fromAddress: groupOwner,
                gas: 7500000,
            });

            // Reset registration fee to default
            // TODO: Remove hex encoding when web3 AbiCoder bug is fixed
            await rocketGroupSettings.setNewFee(web3.utils.numberToHex(newGroupFee), {from: owner, gas: 500000});

            // Default registration fee
            groupID = await scenarioAddGroup({
                name: 'Group 1',
                stakingFee: web3.utils.toWei('0.05', 'ether'),
                value: newGroupFee,
                fromAddress: groupOwner,
                gas: 7500000,
            });

        });


        // Group owner cannot add a group with an invalid name
        it(printTitle('group owner', 'cannot add a group with an invalid name'), async () => {
            await assertThrows(scenarioAddGroup({
                name: 'A',
                stakingFee: web3.utils.toWei('0.05', 'ether'),
                value: newGroupFee,
                fromAddress: groupOwner,
                gas: 7500000,
            }), 'Added a group with an invalid name');
        });


        // Group owner cannot add a group with an existing name
        it(printTitle('group owner', 'cannot add a group with an existing name'), async () => {
            await assertThrows(scenarioAddGroup({
                name: 'Group 1',
                stakingFee: web3.utils.toWei('0.05', 'ether'),
                value: newGroupFee,
                fromAddress: groupOwner,
                gas: 7500000,
            }), 'Added a group with an existing name');
        });


        // Group owner cannot add a group with an invalid staking fee
        it(printTitle('group owner', 'cannot add a group with an invalid staking fee'), async () => {
            await assertThrows(scenarioAddGroup({
                name: 'Group 2',
                stakingFee: web3.utils.toWei('1.05', 'ether'),
                value: newGroupFee,
                fromAddress: groupOwner,
                gas: 7500000,
            }), 'Added a group with an invalid staking fee');
        });


        // Group owner cannot add a group with an invalid registration fee
        it(printTitle('group owner', 'cannot add a group with an invalid registration fee'), async () => {

            // Too low
            await assertThrows(scenarioAddGroup({
                name: 'Group 2',
                stakingFee: web3.utils.toWei('0.05', 'ether'),
                value: Math.floor(newGroupFee / 2),
                fromAddress: groupOwner,
                gas: 7500000,
            }), 'Added a group with an invalid registration fee');

            // Too high
            await assertThrows(scenarioAddGroup({
                name: 'Group 2',
                stakingFee: web3.utils.toWei('0.05', 'ether'),
                value: newGroupFee * 2,
                fromAddress: groupOwner,
                gas: 7500000,
            }), 'Added a group with an invalid registration fee');

        });


        // Group owner cannot add a group while registrations are disabled
        it(printTitle('group owner', 'cannot add a group while registrations are disabled'), async () => {

            // Disable registrations
            rocketGroupSettings.setNewAllowed(false, {from: owner, gas: 500000});

            // Add
            await assertThrows(scenarioAddGroup({
                name: 'Group 2',
                stakingFee: web3.utils.toWei('0.05', 'ether'),
                value: newGroupFee,
                fromAddress: groupOwner,
                gas: 7500000,
            }), 'Added a group while registrations are disabled');

            // Re-enable registrations
            rocketGroupSettings.setNewAllowed(true, {from: owner, gas: 500000});

        });


        // Random account can create a default group accessor
        it(printTitle('random account', 'can create a default group accessor'), async () => {
            await scenarioCreateDefaultGroupAccessor({
                groupID,
                fromAddress: groupAdmin,
                gas: 7500000,
            });
        });


        // Random account cannot create a default group accessor with an invalid group ID
        it(printTitle('random account', 'cannot create a default group accessor with an invalid group ID'), async () => {
            await assertThrows(scenarioCreateDefaultGroupAccessor({
                groupID: accounts[9],
                fromAddress: groupAdmin,
                gas: 7500000,
            }));
        });


    });

};
