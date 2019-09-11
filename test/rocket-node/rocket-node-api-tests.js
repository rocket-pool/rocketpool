import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketNodeSettings } from '../_lib/artifacts';
import { scenarioAddNode, scenarioSetTimezoneLocation } from './rocket-node-api-scenarios';

export default function() {

    contract('RocketNodeAPI', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const operator1 = accounts[1];
        const operator2 = accounts[2];


        // Deployed contracts
        let rocketNodeSettings;
        before(async () => {
            rocketNodeSettings = await RocketNodeSettings.deployed();
        });


        // Node operator can add a node
        it(printTitle('node operator', 'can add a node'), async () => {
            await scenarioAddNode({
                timezone: 'Australia/Brisbane',
                fromAddress: operator1,
            });
        });


        // Node operator cannot add a node when already registered
        it(printTitle('node operator', 'cannot add a node when already registered'), async () => {
            await assertThrows(scenarioAddNode({
                timezone: 'Australia/Brisbane',
                fromAddress: operator1,
            }), 'Added a node when already registered');
        });


        // Node operator cannot add a node with an invalid timezone ID
        it(printTitle('node operator', 'cannot add a node with an invalid timezone ID'), async () => {
            await assertThrows(scenarioAddNode({
                timezone: 'ABC',
                fromAddress: operator2,
            }), 'Added a node with an invalid timezone ID');
        });


        // Node operator cannot add a node while registrations are disabled
        it(printTitle('node operator', 'cannot add a node while registrations are disabled'), async () => {

            // Disable registrations
            await rocketNodeSettings.setNewAllowed(false, {from: owner, gas: 500000});

            // Add node
            await assertThrows(scenarioAddNode({
                timezone: 'Australia/Brisbane',
                fromAddress: operator2,
            }), 'Added a node while registrations are disabled');

            // Reenable registrations
            await rocketNodeSettings.setNewAllowed(true, {from: owner, gas: 500000});

        });


        // Node operator cannot add a node while account contains less than minimum ether
        it(printTitle('node operator', 'cannot add a node while account contains less than minimum ether'), async () => {

            // Get send amount
            let minBalance = parseInt(await rocketNodeSettings.getEtherMin());
            let operatorBalance = parseInt(await web3.eth.getBalance(operator2));
            let sendAmount = Math.floor(operatorBalance - minBalance / 2) / 2;

            // Empty account
            await web3.eth.sendTransaction({
                from: operator2,
                to: operator1,
                value: sendAmount,
                gas: 100000,
            });
            await web3.eth.sendTransaction({
                from: operator2,
                to: operator1,
                value: sendAmount,
                gas: 100000,
            });

            // Add node
            await assertThrows(scenarioAddNode({
                timezone: 'Australia/Brisbane',
                fromAddress: operator2,
            }), 'Added a node while account contains less than minimum ether');

            // Refill account
            await web3.eth.sendTransaction({
                from: operator1,
                to: operator2,
                value: sendAmount,
                gas: 100000,
            });
            await web3.eth.sendTransaction({
                from: operator1,
                to: operator2,
                value: sendAmount,
                gas: 100000,
            });

        });


        // Node operator can set the node's timezone location
        it(printTitle('node operator', 'can set the node\'s timezone location'), async () => {
            await scenarioSetTimezoneLocation({
                timezone: 'Australia/Sydney',
                fromAddress: operator1,
            });
        });


        // Random account cannot set a node's timezone location
        it(printTitle('random account', 'cannot set a node\'s timezone location'), async () => {
            await assertThrows(scenarioSetTimezoneLocation({
                timezone: 'Australia/Sydney',
                fromAddress: accounts[9],
            }), 'Random account set a node timezone location');
        });


    });

};
