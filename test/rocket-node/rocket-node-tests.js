// OS methods
const os = require('os');

import { printTitle, assertThrows } from '../utils';
import { RocketSettings, RocketPool, Casper } from '../artifacts';
import { scenarioIncrementEpoch, scenarioIncrementDynasty, scenarioCreateValidationContract } from '../casper/casper-scenarios';
import { scenarioDeposit, scenarioWithdrawDeposit } from '../rocket-user/rocket-user-scenarios';
import { scenarioWithdrawDepositTokens } from '../rocket-deposit/rocket-deposit-scenarios';
import { scenarioRegisterNode, scenarioNodeCheckin, scenarioRemoveNode } from './rocket-node-scenarios';

export default function({owner}) {

    contract('RocketNode', async (accounts) => {


        /**
         * Config
         */

        // Node addresses
        const nodeFirst = accounts[8];
        const nodeSecond = accounts[9];

        // User addresses
        const userFirst = accounts[1];
        const userSecond = accounts[2];

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
        const nodeCheckinGas = 950000;

        // Minipools
        let miniPools = {};


        /**
         * Node registration
         */
        describe('Registration', async () => {


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


        /**
         * Node checkin
         */
        describe('Checkin', async () => {


            // Contract dependencies
            let rocketSettings;
            let rocketPool;
            let casper;
            before(async () => {
                rocketSettings = await RocketSettings.deployed();
                rocketPool = await RocketPool.deployed();
                casper = await Casper.deployed();
            });


            // Initialise casper state
            before(async() => {
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
            });


            // Initialise minipools
            before(async () => {

                // Get the amount of ether to deposit - enough to launch a minipool
                const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call();
                const sendAmount = parseInt(minEtherRequired.valueOf());

                // Deposit ether to create first minipool
                let miniPool1 = await scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userFirst,
                    depositAmount: sendAmount,
                    gas: 4800000,
                });

                // Deposit ether to create second minipool
                let miniPool2 = await scenarioDeposit({
                    stakingTimeID: 'short',
                    fromAddress: userSecond,
                    depositAmount: sendAmount,
                    gas: 4800000,
                });

                // Set minipools
                miniPools.first = miniPool1;
                miniPools.second = miniPool2;

            });


            // Node performs first checkin, no pools should be launched yet
            it(printTitle('nodeFirst', 'first node performs checkin, no minipool awaiting launch should be launched yet as the countdown has not passed for either'), async () => {

                // Get average CPU load
                // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
                // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
                let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

                // Perform checkin
                await scenarioNodeCheckin({
                    averageLoad: averageLoad15mins,
                    fromAddress: nodeFirst,
                });

                // Check node's minipool count
                let nodeMiniPoolCount = await rocketPool.getPoolsFilterWithNodeCount.call(nodeFirst);
                assert.equal(nodeMiniPoolCount.valueOf(), 0, 'Pool count is not correct');

            });


            // Node performs second checkin, sets the launch time for minipools to 0 so that the first awaiting minipool is launched
            it(printTitle('nodeFirst', 'first node performs second checkin, 1 of the 2 minipools awaiting launch should be launched as countdown is set to 0 and balance sent to Casper'), async () => {

                // Get average CPU load
                // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
                // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
                let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

                // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
                await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

                // Perform checkin
                await scenarioNodeCheckin({
                    averageLoad: averageLoad15mins,
                    fromAddress: nodeFirst,
                });

                // Check node's attached minipools
                let nodeMiniPoolsAttached = await rocketPool.getPoolsFilterWithNode.call(nodeFirst);
                let nodeMiniPoolBalance = web3.eth.getBalance(miniPools.first.address).valueOf();
                let nodeMiniPoolStatus = await miniPools.first.getStatus.call();
                assert.equal(nodeMiniPoolsAttached.length, 1, 'Invalid number of minipools attached to node');
                assert.equal(nodeMiniPoolsAttached[0], miniPools.first.address, 'Invalid address of minipool attached to node');
                assert.equal(nodeMiniPoolBalance, 0, 'Invalid attached minipool balance');
                assert.equal(nodeMiniPoolStatus.valueOf(), 2, 'Invalid attached minipool status');

                // Check it's a validator in casper
                let casperValidatorIndex = await casper.get_validator_indexes.call(miniPools.first.address);
                let casperValidatorDynastyStart = await casper.get_validators__dynasty_start.call(casperValidatorIndex);
                assert.equal(casperValidatorIndex.valueOf(), 1, 'Invalid validator index');
                assert.equal(casperValidatorDynastyStart.valueOf(), 3, 'Invalid validator dynasty');

            });


            // Simulate Caspers epoch and dynasty changing for the second deposit
            it(printTitle('casper', 'simulate Caspers epoch and dynasty changing for the second deposit'), async () => {
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
            });


            // Node performs second checkin, sets the launch time for minipools to 0 so that the second awaiting minipool is launched
            it(printTitle('nodeSecond', 'second node performs first checkin, 2 of the 2 minipools awaiting launch should be launched as countdown is set to 0 and balance sent to Casper'), async () => {

                // Get average CPU load
                // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
                // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
                let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

                // Perform checkin
                await scenarioNodeCheckin({
                    averageLoad: averageLoad15mins,
                    fromAddress: nodeSecond,
                });

                // Check node's attached minipools
                let nodeMiniPoolsAttached = await rocketPool.getPoolsFilterWithNode.call(nodeSecond);
                let nodeMiniPoolBalance = web3.eth.getBalance(miniPools.second.address).valueOf();
                let nodeMiniPoolStatus = await miniPools.second.getStatus.call();
                assert.equal(nodeMiniPoolsAttached.length, 1, 'Invalid number of minipools attached to node');
                assert.equal(nodeMiniPoolsAttached[0], miniPools.second.address, 'Invalid address of minipool attached to node');
                assert.equal(nodeMiniPoolBalance, 0, 'Invalid attached minipool balance');
                assert.equal(nodeMiniPoolStatus.valueOf(), 2, 'Invalid attached minipool status');

                // Check it's a validator in casper
                let casperValidatorIndex = await casper.get_validator_indexes.call(miniPools.second.address);
                let casperValidatorDynastyStart = await casper.get_validators__dynasty_start.call(casperValidatorIndex);
                assert.equal(casperValidatorIndex.valueOf(), 2, 'Invalid validator index');
                assert.equal(casperValidatorDynastyStart.valueOf(), 5, 'Invalid validator dynasty');

            });


            // Second user withdraws entire deposit
            it(printTitle('---------', 'second user withdraws entire deposit, leaving second minipool empty'), async () => {
                await scenarioWithdrawDepositTokens({
                    miniPool: miniPools.second,
                    withdrawalAmount: 0,
                    fromAddress: userSecond,
                    gas: 500000,
                });
            });


            // Node performs checkin
            it(printTitle('nodeFirst', 'first node performs another checkin, first minipool currently staking should remain staking on it'), async () => {

                // Get average CPU load
                let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

                // Perform checkin
                await scenarioNodeCheckin({
                    averageLoad: averageLoad15mins,
                    fromAddress: nodeFirst,
                });

                // Check attached minipool is still staking
                let nodeMiniPoolStatus = await miniPools.first.getStatus.call();
                let nodeMiniPoolBalance = web3.eth.getBalance(miniPools.first.address);
                assert.equal(nodeMiniPoolStatus.valueOf(), 2, 'Invalid attached minipool status');
                assert.equal(nodeMiniPoolBalance.valueOf(), 0, 'Invalid attached minipool balance');

            });


            // Update first minipool
            it(printTitle('---------', 'first minipool has staking duration set to 0'), async () => {

                // Set the minipool staking duration to 0 for testing so it will attempt to request withdrawal from Casper
                await rocketPool.setPoolStakingDuration(miniPools.first.address, 0, { from: owner, gas: 150000 });

                // TODO: check pool staking duration, dummy test for now

            });


            // Update second minipool
            it(printTitle('---------', 'second minipool has staking duration set to 0'), async () => {

                // Set the minipool staking duration to 0 for testing so it will attempt to request withdrawal from Casper
                await rocketPool.setPoolStakingDuration(miniPools.second.address, 0, { from: owner, gas: 150000 });

                // TODO: check pool staking duration, dummy test for now

            });


            // Simulate Caspers epoch and dynasty changing to allow withdrawals
            it(printTitle('casper', 'simulate Caspers epoch and dynasty changing to allow withdrawals'), async () => {
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
            });


            // Node performs checkin
            it(printTitle('nodeFirst', 'first node performs another checkin after both minipools have staking duration set to 0. Only minipool attached to first node will signal logged out from Casper.'), async () => {

                // Get average CPU load
                let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

                // Perform checkin
                await scenarioNodeCheckin({
                    averageLoad: averageLoad15mins,
                    fromAddress: nodeFirst,
                });

                // Check attached minipool is awaiting withdrawal & other minipool is still staking
                let nodeMiniPoolStatus = await miniPools.first.getStatus.call();
                let otherMiniPoolStatus = await miniPools.second.getStatus.call();
                assert.equal(nodeMiniPoolStatus.valueOf(), 3, 'Invalid attached minipool status');
                assert.equal(otherMiniPoolStatus.valueOf(), 2, 'Invalid other minipool status');

            });


            // Node performs checkin
            it(printTitle('nodeSecond', 'second node performs another checkin after both minipools have staking duration set to 0. Only minipool attached to second node will signal logged out from Casper.'), async () => {

                // Get average CPU load
                let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

                // Perform checkin
                await scenarioNodeCheckin({
                    averageLoad: averageLoad15mins,
                    fromAddress: nodeSecond,
                });

                // Check both minipools are awaiting withdrawal
                let nodeMiniPoolStatus = await miniPools.second.getStatus.call();
                let otherMiniPoolStatus = await miniPools.first.getStatus.call();
                assert.equal(nodeMiniPoolStatus.valueOf(), 3, 'Invalid attached minipool status');
                assert.equal(otherMiniPoolStatus.valueOf(), 3, 'Invalid other minipool status');

            });


            // Simulate Caspers epoch and dynasty changing for the second deposit
            it(printTitle('casper', 'simulate Caspers epoch and dynasty incrementing to allow first minipool validator to withdraw'), async () => {
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementEpoch(owner);
            });


            // Node performs checkin
            it(printTitle('nodeFirst', 'first node performs another checkin and first minipool to change status and request actual deposit withdrawal from Casper'), async () => {

                // Get average CPU load
                let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

                // Perform checkin
                await scenarioNodeCheckin({
                    averageLoad: averageLoad15mins,
                    fromAddress: nodeFirst,
                });

                // Check attached minipool has withdrawn deposit from casper
                let nodeMiniPoolStatus = await miniPools.first.getStatus.call();
                let nodeMiniPoolBalance = web3.eth.getBalance(miniPools.first.address);
                assert.equal(nodeMiniPoolStatus.valueOf(), 4, 'Invalid attached minipool status');
                assert.isTrue(nodeMiniPoolBalance.valueOf() > 0, 'Invalid attached minipool balance');

                // Check other minipool is still awaiting withdrawal
                let otherMiniPoolStatus = await miniPools.second.getStatus.call();
                let otherMiniPoolBalance = web3.eth.getBalance(miniPools.second.address);
                assert.equal(otherMiniPoolStatus.valueOf(), 3, 'Invalid other minipool status');
                assert.equal(otherMiniPoolBalance.valueOf(), 0, 'Invalid other minipool balance');

            });


            // Node performs checkin
            it(printTitle('nodeFirst', 'first node performs another checkin and second minipool requests deposit from Casper, receives it then closes the pool as all users have withdrawn deposit as tokens'), async () => {

                // Get average CPU load
                let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

                // Perform checkin
                await scenarioNodeCheckin({
                    averageLoad: averageLoad15mins,
                    fromAddress: nodeFirst,
                });

                // Check attached minipool has withdrawn deposit from casper
                let nodeMiniPoolStatus = await miniPools.first.getStatus.call();
                let nodeMiniPoolBalance = web3.eth.getBalance(miniPools.first.address);
                assert.equal(nodeMiniPoolStatus.valueOf(), 4, 'Invalid attached minipool status');
                assert.isTrue(nodeMiniPoolBalance.valueOf() > 0, 'Invalid attached minipool balance');

                // Check other minipool has closed
                let otherMiniPoolBalance = web3.eth.getBalance(miniPools.second.address);
                assert.equal(otherMiniPoolBalance.valueOf(), 0, 'Invalid other minipool balance');

            });


        });


        /**
         * Node removal
         */
        describe('Removal', async () => {


            // Owner attempts to remove active node
            it(printTitle('owner', 'fails to remove first node from the Rocket Pool network as it has minipools attached to it'), async () => {
                await assertThrows(scenarioRemoveNode({
                    nodeAddress: nodeFirst,
                    fromAddress: owner,
                    gas: 200000,
                }));
            });


            // First user withdraws entire deposit
            it(printTitle('---------', 'first user withdraws entire deposit, leaving first minipool empty'), async () => {
                await scenarioWithdrawDeposit({
                    miniPool: miniPools.first,
                    withdrawalAmount: 0,
                    fromAddress: userFirst,
                    feeAccountAddress: owner,
                    gas: 1450000,
                });
            });


            // Owner removes first node
            it(printTitle('owner', 'removes first node from the Rocket Pool network'), async () => {
                await scenarioRemoveNode({
                    nodeAddress: nodeFirst,
                    fromAddress: owner,
                    gas: 200000,
                });
            });


        });


    });

}
