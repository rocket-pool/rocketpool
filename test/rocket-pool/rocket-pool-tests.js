import { RocketSettings, RocketPool } from '../_lib/artifacts'
import { initialiseMiniPool } from '../rocket-user/rocket-user-utils';
import { sendDeployValidationContract } from '../_lib/smart-node/validation-code-contract-compiled';
import { scenarioRegisterNode } from '../rocket-node/rocket-node-admin/rocket-node-admin-scenarios';
import { scenarioNodeCheckin } from '../rocket-node/rocket-node-status/rocket-node-status-scenarios';
import { casperEpochInitialise, casperEpochIncrementAmount } from '../_lib/casper/casper';


export default function({owner}) {

    const nodeRegisterGas = 1600000;

    contract('RocketPool - getPoolsFilterWithNodeWithStatus', async (accounts) => {

            /**
         * Config
         */

        // User addresses
        const userFirst = accounts[1];
        const userSecond = accounts[2];

        // Node addresses
        const nodeFirst = accounts[8];
        const nodeSecond = accounts[9];

        // Minipools
        let miniPools = {};

        // Contract dependencies
        let rocketPool;
        let rocketSettings;
        before(async () => {
            rocketPool = await RocketPool.deployed();
            rocketSettings = await RocketSettings.deployed();

            await casperEpochInitialise(owner);

            // Initialise minipools
            miniPools.first = await initialiseMiniPool({fromAddress: userFirst});

            // register first node
            let validationFirstTx = await sendDeployValidationContract(nodeFirst);
            let nodeFirstValCodeAddress = validationFirstTx.contractAddress;
            await scenarioRegisterNode({
                nodeAddress: nodeFirst,
                valCodeAddress: nodeFirstValCodeAddress,
                providerID: '',
                subnetID: '',
                instanceID: '',
                regionID: '',
                fromAddress: owner,
                gas: nodeRegisterGas
            }); 

            // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
            await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

            // Get average CPU load
            // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
            // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
            let firstNodeLoad = 0.5;
            let firstNodeLoadWei = web3.toWei(firstNodeLoad, 'ether');
            // Perform checkin, to assign the minipool to the node for launch
            await scenarioNodeCheckin({
                averageLoad: firstNodeLoadWei,
                fromAddress: nodeFirst,
            });

            // Mine to an epoch for Casper
            await casperEpochIncrementAmount(owner, 1);

            // register another node
            let validationSecondTx = await sendDeployValidationContract(nodeSecond);
            let nodeSecondValCodeAddress = validationSecondTx.contractAddress;
            await scenarioRegisterNode({
                nodeAddress: nodeSecond,
                valCodeAddress: nodeSecondValCodeAddress,
                providerID: '',
                subnetID: '',
                instanceID: '',
                regionID: '',
                fromAddress: owner,
                gas: nodeRegisterGas
            });

            // Mine to an epoch for Casper
            await casperEpochIncrementAmount(owner, 1);

            // set load for second node
            let secondNodeLoad = 0.1; // low load
            let secondNodeLoadWei = web3.toWei(secondNodeLoad, 'ether');
            await scenarioNodeCheckin({
                averageLoad: secondNodeLoadWei,
                fromAddress: nodeSecond,
            });

            // initialise a minipool for assignment
            miniPools.second = await initialiseMiniPool({fromAddress: userSecond});

             // Mines to an epoch start block so that we can launch the minipool (deposit into Casper)
            await casperEpochIncrementAmount(owner, 1);

            // perform checkin to launch minipool using second node
            await scenarioNodeCheckin({
                averageLoad: firstNodeLoadWei,
                fromAddress: nodeFirst,
            });
        });       

        it('returns only pools associated with the node provided', async () => {                        
            let nodeFirstPoolsStaking = await rocketPool.getPoolsFilterWithNodeWithStatus.call(nodeFirst, 2);
            assert.isTrue(nodeFirstPoolsStaking.length == 1);

            let nodeSecondPoolsStaking = await rocketPool.getPoolsFilterWithNodeWithStatus.call(nodeSecond, 2);
            assert.isTrue(nodeSecondPoolsStaking.length == 1);

            assert.isTrue(nodeFirstPoolsStaking[0] != nodeSecondPoolsStaking[0]);
        });

        it('returns only pools with the status provided', async () => {                        
            let nodeFirstPoolsStaking = await rocketPool.getPoolsFilterWithNodeWithStatus.call(nodeFirst, 2);
            assert.isTrue(nodeFirstPoolsStaking.length == 1);

            let nodeFirstPoolsNotStaking = await rocketPool.getPoolsFilterWithNodeWithStatus.call(nodeFirst, 1);
            assert.isTrue(nodeFirstPoolsNotStaking.length == 0);
        });

    });

}

