const os = require('os');

import { printTitle, assertThrows } from '../../_lib/utils/general';
import { RocketSettings, Casper }  from '../../_lib/artifacts';
import { initialiseMiniPool } from '../../rocket-user/rocket-user-utils';
import { scenarioCreateValidationContract } from '../../casper/casper-scenarios';
import { scenarioWithdrawDeposit } from '../../rocket-user/rocket-user-scenarios';
import { scenarioNodeCheckin } from '../rocket-node-status/rocket-node-status-scenarios';
import { scenarioRegisterNode, scenarioRemoveNode } from './rocket-node-admin-scenarios';



export default function({owner}) {

    /**
     * Config
     */

    // Node details
    const nodeFirstProviderID = 'aws';
    const nodeFirstSubnetID = 'nvirginia';
    const nodeFirstInstanceID = 'i-1234567890abcdef5';
    const nodeFirstRegionID = 'usa-east';
    const nodeSecondProviderID = 'rackspace';
    const nodeSecondSubnetID = 'ohio';
    const nodeSecondInstanceID = '4325';
    const nodeSecondRegionID = 'usa-east';

    // Gas costs
    const nodeRegisterGas = 1600000;

    contract('RocketNodeAdmin - Registration', async (accounts) => {

        // Node addresses
        const nodeFirst = accounts[8];
        const nodeSecond = accounts[9];
        const nodeThird = accounts[7];
        const nodeFourth = accounts[6];

        // User addresses
        const userFirst = accounts[1];
        const userSecond = accounts[2];

        // Minipools
        let miniPools = {};

        // Node to remove after tests
        let registeredNodes = [];


        // Contract dependencies
        let rocketSettings;
        before(async () => {
            rocketSettings = await RocketSettings.deployed();
        });           


        // Register test node
        it(printTitle('owner', 'register first node and verify its signature and validation contract are correct'), async () => {

            let nodeFirstValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeFirst});

            await scenarioRegisterNode({
                nodeAddress: nodeFirst,
                valCodeAddress: nodeFirstValCodeAddress,
                providerID: nodeFirstProviderID,
                subnetID: nodeFirstSubnetID,
                instanceID: nodeFirstInstanceID,
                regionID: nodeFirstRegionID,
                fromAddress: owner,
                gas: nodeRegisterGas
            });

            // clean up
            await scenarioRemoveNode({
                nodeAddress: nodeFirst,
                fromAddress: owner,
                gas: 200000,
            });
        });


        // Try to register a node with a wrong validation address
        it(printTitle('owner', 'fail to register a node with a validation contract that does not match'), async () => {

            let nodeFirstValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeFirst});
            let nodeSecondValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeSecond});

            await assertThrows(scenarioRegisterNode({
                nodeAddress: nodeSecond,
                valCodeAddress: nodeSecondValCodeAddress,
                addValCodeAddress: nodeFirstValCodeAddress,
                providerID: nodeSecondProviderID,
                subnetID: nodeSecondSubnetID,
                instanceID: nodeSecondInstanceID,
                regionID: nodeSecondRegionID,
                fromAddress: owner,
                gas: nodeRegisterGas
            }));
        });


        // Register test node
        it(printTitle('owner', 'register second node and verify its signature and validation contract are correct'), async () => {
            
            let nodeSecondValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeSecond});

            await scenarioRegisterNode({
                nodeAddress: nodeSecond,
                valCodeAddress: nodeSecondValCodeAddress,
                providerID: nodeSecondProviderID,
                subnetID: nodeSecondSubnetID,
                instanceID: nodeSecondInstanceID,
                regionID: nodeSecondRegionID,
                fromAddress: owner,
                gas: nodeRegisterGas
            });

            // clean up
            await scenarioRemoveNode({
                nodeAddress: nodeSecond,
                fromAddress: owner,
                gas: 200000,
            });
        });


        // Owner cannot register a node with an invalid (null) address
        it(printTitle('owner', 'cannot register a node with an invalid address'), async () => {
            let valCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeThird});
            await assertThrows(scenarioRegisterNode({
                nodeAddress: '0x0000000000000000000000000000000000000000',
                signNodeAddress: nodeThird,
                valCodeAddress: valCodeAddress,
                providerID: nodeFirstProviderID,
                subnetID: nodeFirstSubnetID,
                instanceID: nodeFirstInstanceID,
                regionID: nodeFirstRegionID,
                fromAddress: owner,
                gas: nodeRegisterGas
            }));
        });


        // Owner cannot register a node with a balance less than the minimum smart node balance
        it(printTitle('owner', 'cannot register a node with a balance less than the minimum smart node balance'), async () => {

            // Get minimum smart node balance
            const minSmartNodeBalance = await rocketSettings.getSmartNodeEtherMin();

            // Deplete third node balance
            let nodeThirdBalanceOld = parseInt(web3.eth.getBalance(nodeThird).valueOf());
            let sendAmount = nodeThirdBalanceOld - web3.toWei('0.1', 'ether');
            await web3.eth.sendTransaction({from: nodeThird, to: nodeFirst, value: sendAmount});

            // Check third node balance is less than minimum smart node balance
            let nodeThirdBalanceNew = parseInt(web3.eth.getBalance(nodeThird).valueOf());
            assert.isTrue(nodeThirdBalanceNew < parseInt(minSmartNodeBalance.valueOf()), 'Node balance is less than minimum smart node balance');

            // Attempt to register node
            let valCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeThird});
            await assertThrows(scenarioRegisterNode({
                nodeAddress: nodeThird,
                valCodeAddress: valCodeAddress,
                providerID: nodeFirstProviderID,
                subnetID: nodeFirstSubnetID,
                instanceID: nodeFirstInstanceID,
                regionID: nodeFirstRegionID,
                fromAddress: owner,
                gas: nodeRegisterGas
            }));

        });


        // Owner cannot register a node with an address that has already been used
        it(printTitle('owner', 'cannot register a node with an address that already exists'), async () => { 
            let valCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeFirst});

            // successfully register a node
            await scenarioRegisterNode({
                nodeAddress: nodeFirst,
                valCodeAddress: valCodeAddress,
                providerID: nodeFirstProviderID,
                subnetID: nodeFirstSubnetID,
                instanceID: nodeFirstInstanceID,
                regionID: nodeFirstRegionID,
                fromAddress: owner,
                gas: nodeRegisterGas
            })
            
            // attempt to register another node with the same address
            await assertThrows(scenarioRegisterNode({
                nodeAddress: nodeFirst,
                valCodeAddress: valCodeAddress,
                providerID: nodeFirstProviderID,
                subnetID: nodeFirstSubnetID,
                instanceID: nodeFirstInstanceID,
                regionID: nodeFirstRegionID,
                fromAddress: owner,
                gas: nodeRegisterGas
            }));

                // clean up
                await scenarioRemoveNode({
                nodeAddress: nodeFirst,
                fromAddress: owner,
                gas: 200000,
            });
        });


        // Random address cannot register a node
        it(printTitle('random address', 'cannot register a node'), async () => {
            let valCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeFourth});
            await assertThrows(scenarioRegisterNode({
                nodeAddress: nodeFourth,
                valCodeAddress: valCodeAddress,
                providerID: nodeFirstProviderID,
                subnetID: nodeFirstSubnetID,
                instanceID: nodeFirstInstanceID,
                regionID: nodeFirstRegionID,
                fromAddress: userFirst,
                gas: nodeRegisterGas
            }));
        });

    });

    /**
    * Node removal
    */
    contract('RocketNodeAdmin - Removal', async (accounts) => {    

        // Node addresses
        const nodeFirst = accounts[8];
        const nodeSecond = accounts[9];
        const nodeThird = accounts[7];
        const nodeFourth = accounts[6];

        // User addresses
        const userFirst = accounts[1];
        const userSecond = accounts[2];
        
        let rocketSettings;

        before(async () => {
            rocketSettings = await RocketSettings.deployed();
        });

        // Owner removes first node
        it(printTitle('owner', 'can remove a node from the Rocket Pool network'), async () => {
            let valCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeFirst});

            // successfully register a node
            await scenarioRegisterNode({
                nodeAddress: nodeFirst,
                valCodeAddress: valCodeAddress,
                providerID: nodeFirstProviderID,
                subnetID: nodeFirstSubnetID,
                instanceID: nodeFirstInstanceID,
                regionID: nodeFirstRegionID,
                fromAddress: owner,
                gas: nodeRegisterGas
            });               

            // remove it
            await scenarioRemoveNode({
                nodeAddress: nodeFirst,
                fromAddress: owner,
                gas: 200000,
            });
        });

        // Owner attempts to remove active node
        it(printTitle('owner', 'fails to remove first node from the Rocket Pool network as it has minipools attached to it'), async () => {
            let nodeSecondValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeSecond});

            // register node
            await scenarioRegisterNode({
                nodeAddress: nodeSecond,
                valCodeAddress: nodeSecondValCodeAddress,
                providerID: nodeSecondProviderID,
                subnetID: nodeSecondSubnetID,
                instanceID: nodeSecondInstanceID,
                regionID: nodeSecondRegionID,
                fromAddress: owner,
                gas: nodeRegisterGas
            });

            // deposit funds, thus creating a minipool
            let miniPoolsFirst = await initialiseMiniPool({fromAddress: userFirst});

            // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
            await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

            // Get average CPU load
            let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

            // Perform checkin, so that the minipool will be attached to our new node
            await scenarioNodeCheckin({
                averageLoad: averageLoad15mins,
                fromAddress: nodeSecond,
            });               

            // attempt to remove the node with the attached minipool
            await assertThrows(scenarioRemoveNode({
                nodeAddress: nodeSecond,
                fromAddress: owner,
                gas: 200000,
            }));               
        });

        // Owner cannot remove a node that doesn't exist
        it(printTitle('owner', 'cannot remove a nonexistent node'), async () => {
            let notNodeAddress = userFirst;
            await assertThrows(scenarioRemoveNode({
                nodeAddress: notNodeAddress,
                fromAddress: owner,
                gas: 200000,
            }));
        });


        // Random address cannot remove a node
        it(printTitle('random address', 'cannot remove a node'), async () => {
            let randomAddress = userFirst;
            await assertThrows(scenarioRemoveNode({
                nodeAddress: nodeFirst,
                fromAddress: randomAddress,
                gas: 200000,
            }));
        });

    });

}