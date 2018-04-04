import { printTitle, assertThrows } from '../utils';
import { scenarioCreateValidationContract } from '../casper/casper-scenarios';
import { scenarioRegisterNode } from './rocket-node-scenarios';

export default function({
    owner,
    accounts,
    nodeFirst,
    nodeFirstProviderID,
    nodeFirstSubnetID,
    nodeFirstInstanceID,
    nodeFirstRegionID,
    nodeSecond,
    nodeSecondProviderID,
    nodeSecondSubnetID,
    nodeSecondInstanceID,
    nodeSecondRegionID,
    nodeRegisterGas
}) {

    describe('RocketNode', async () => {


        // Addresses
        let nodeFirstValCodeAddress = 0;
        let nodeSecondValCodeAddress = 0;


        // Register validation contract address for node
        it(printTitle('nodeFirst', 'create validation contract and set address'), async () => {
            nodeFirstValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeFirst});
        });


        // Register test node
        it(printTitle('owner', 'register first node and verify its signature and validation contract are correct'), async () => {
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
        });


        // Register validation contract address for node
        it(printTitle('nodeSecond', 'create validation contract and set address'), async () => {
            nodeSecondValCodeAddress = await scenarioCreateValidationContract({fromAddress: nodeSecond});
        });


        // Try to register a node with a wrong validation address
        it(printTitle('owner', 'fail to register a node with a validation contract that does not match'), async () => {
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
        });


    });

};
