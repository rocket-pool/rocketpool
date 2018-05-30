const os = require('os');

import { printTitle, assertThrows }  from '../../_lib/utils/general';
import { RocketPool, RocketSettings, Casper, RocketPoolMini }  from '../../_lib/artifacts';
import { initialiseMiniPool } from '../../rocket-user/rocket-user-utils';
import { scenarioNodeCheckin } from '../rocket-node-status/rocket-node-status-scenarios';
import { scenarioRegisterNode } from '../rocket-node-admin/rocket-node-admin-scenarios';
import { scenarioNodeVoteCast, scenarioNodeLogout } from './rocket-node-validator-scenarios';
import { sendDeployValidationContract } from '../../_lib/smart-node/validation-code-contract-compiled';
import { CasperInstance, casperEpochInitialise, casperEpochIncrementAmount } from '../../_lib/casper/casper';

export default function({owner}) {

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
    const nodeVotingGas = 1600000;
    const nodeLogoutGas = 1600000;


    contract('RocketNodeValidator - Voting', async (accounts) => {

        /**
         * Config
         */

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

        // Contract dependencies
        let rocketSettings;
        let rocketPool;
        let casper;

        before(async () => {

            // Initalise contracts
            rocketSettings = await RocketSettings.deployed();
            rocketPool = await RocketPool.deployed();
            casper = await CasperInstance();

            
            // Initialise minipools
            miniPools.first = await initialiseMiniPool({fromAddress: userFirst});
            miniPools.second = await initialiseMiniPool({fromAddress: userSecond});

            // register first node
            let validationFirstTx = await sendDeployValidationContract(nodeFirst);
            let nodeFirstValCodeAddress = validationFirstTx.contractAddress;
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

            // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
            await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

            // Mine to an epoch for Casper
            await casperEpochInitialise(owner);
            await casperEpochIncrementAmount(owner, 1);

            // Get average CPU load
            // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
            // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
            let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

            // Perform checkin, to assign the minipool to the node for launch
            await scenarioNodeCheckin({
                averageLoad: averageLoad15mins,
                fromAddress: nodeFirst,
            });

            // Mine 2 dynasties to ensure minipool is logged into Casper - no deposits yet so these will automatically finalise (no voting required)
            await casperEpochIncrementAmount(owner, 1);
            await casperEpochIncrementAmount(owner, 1);
            
            // Precheck - make sure minipool is now logged into Casper
            let dynasty = await casper.methods.dynasty().call({from: owner});
            let validatorIndex = parseInt(await casper.methods.validator_indexes(miniPools.first.address).call({from: owner}));
            let startDynasty = await casper.methods.validators__start_dynasty(validatorIndex).call({from: owner});
            assert.equal(dynasty, startDynasty, 'Dynasty should equal the start dynasty of the validator otherwise they are not logged in.')

        });

        it(printTitle('registered node', 'can cast a checkpoint vote with Casper'), async () => { 
            // Mine to next epoch
            await casperEpochIncrementAmount(owner, 1);
            
            await scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                minipoolAddress: miniPools.first.address,
                gas: nodeVotingGas
            });
        });


        it(printTitle('registered node', 'cannot cast a vote with an empty vote message'), async () => {
            // Mine to next epoch
            await casperEpochIncrementAmount(owner, 1);

            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                minipoolAddress: miniPools.first.address,
                emptyVoteMessage: true,
                gas: nodeVotingGas
            }));
        });

        it(printTitle('registered node', 'can only cast a vote for a pool that it is attached to'), async () => {
            // Mine to next epoch
            await casperEpochIncrementAmount(owner, 1);

            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                minipoolAddress: miniPools.second.address, // not nodeFirst's minipool
                gas: nodeVotingGas
            }));
        });

        it(printTitle('registered node', 'must pass minipool address to vote'), async () => {
            // Mine to next epoch
            await casperEpochIncrementAmount(owner, 1);

            let nullAddress = "";
            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                minipoolAddress: nullAddress,
                gas: nodeVotingGas
            }));
        });

        it(printTitle('registered node', 'can only cast a vote for a pool that is staking'), async () => {
            // Set our pool launch timer to 1000 setting so that it will not trigger a minipool launch
            await rocketSettings.setMiniPoolCountDownTime(1000, {from: web3.eth.coinbase, gas: 500000});

            // Mine to next epoch
            await casperEpochIncrementAmount(owner, 1);

            // Get average CPU load
            let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

            // Perform checkin, to assign the second minipool to the node for launch
            await scenarioNodeCheckin({
                averageLoad: averageLoad15mins,
                fromAddress: nodeFirst,
            });

            // precheck that the minipool is not staking
            let miniPoolStatus = await miniPools.second.getStatus.call();
            assert.notEqual(miniPoolStatus, 2, 'Precheck failed - minipool is staking when it should not be');

            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                minipoolAddress: miniPools.second.address,
                gas: nodeVotingGas
            }));
        });

                
        it(printTitle('registered node', 'can only cast one vote per epoch'), async () => { 
            // Mine to next epoch
            await casperEpochIncrementAmount(owner, 1);
            
            // vote for epoch
            await scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                minipoolAddress: miniPools.first.address,
                gas: nodeVotingGas
            });           

            // vote again for same epoch - should fail because we are trying to vote twice for same epoch
            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                minipoolAddress: miniPools.first.address,
                gas: nodeVotingGas
            }));
        });

    });

    contract('RocketNodeValidator - Logout', async (accounts) => {

        /**
         * Config
         */

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

        // Contract dependencies
        let rocketSettings;
        let rocketPool;
        let casper;

        before(async () => {

            // Initalise contracts
            rocketSettings = await RocketSettings.deployed();
            rocketPool = await RocketPool.deployed();
            casper = await CasperInstance();

            // Initialise minipools
            miniPools.first = await initialiseMiniPool({fromAddress: userFirst});            

            // register first node
            let validationFirstTx = await sendDeployValidationContract(nodeFirst);
            let nodeFirstValCodeAddress = validationFirstTx.contractAddress;
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

            // Initialise Casper to current epoch
            await casperEpochInitialise(owner);

            // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
            await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

            // Mine to next epoch
            await casperEpochIncrementAmount(owner, 1);

            // Get average CPU load
            // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
            // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
            let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

            // Perform checkin, to assign the minipool to the node for launch
            await scenarioNodeCheckin({
                averageLoad: averageLoad15mins,
                fromAddress: nodeFirst,
            });

            // Mine to next epoch
            await casperEpochIncrementAmount(owner, 1);

        });

        it(printTitle('registered node', 'must provide a minipool address to logout'), async () =>{     
            let blankMiniPool = '';
            await assertThrows(
                scenarioNodeLogout({
                    nodeAddress: nodeFirst,
                    minipoolAddress: blankMiniPool,
                    gas: nodeLogoutGas
                })
            );
        });

        it(printTitle('registered node', 'must provide a logout message to logout'), async () =>{   
            let logoutMessage = '';
            await assertThrows(
                scenarioNodeLogout({
                    nodeAddress: nodeFirst,
                    minipoolAddress: miniPools.first.address, 
                    gas: nodeLogoutGas
                })
            );
        });

        it(printTitle('registered node', 'should be able to logout from Casper after staking period'), async () => {

            // Precheck minipool is a validator in Casper
            let casperValidatorIndex = await casper.methods.validator_indexes(miniPools.first.address).call({from: owner});
            assert.equal(casperValidatorIndex.valueOf(), 1, 'Invalid precheck validator index');
            // And the end dynasty is pretry much infinity
            let casperValidatorDynastyEnd = await casper.methods.validators__end_dynasty(casperValidatorIndex).call({from: owner});
            assert.isAbove(casperValidatorDynastyEnd.valueOf(), 10000000000000, 'Invalid precheck validator end dynasty');

            // Set the minipool staking duration to 0 for testing so it will attempt to request logout from Casper
            await rocketPool.setPoolStakingDuration(miniPools.first.address, 0, { from: owner, gas: 150000 });

            // Logout of Casper
            await scenarioNodeLogout({
                nodeAddress: nodeFirst,
                minipoolAddress: miniPools.first.address,
                gas: nodeLogoutGas
            })

            // Should still be a validator
            casperValidatorIndex = await casper.methods.validator_indexes(miniPools.first.address).call({from: owner});
            assert.equal(casperValidatorIndex.valueOf(), 1, 'Invalid post check validator index');
            // But end dynasty should be set to: <current dynasty> + logout_delay_dynasty
            casperValidatorDynastyEnd = await casper.methods.validators__end_dynasty(casperValidatorIndex).call({from: owner});
            assert.isBelow(casperValidatorDynastyEnd.valueOf(), 10000000000000, 'Invalid post check validator end dynasty not set');

        });

        it(printTitle('registered node', 'can only log out a minipool that is assigned to it'), async () =>{

            // bring up a minipool
            miniPools.second = await initialiseMiniPool({fromAddress: userSecond});

            // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
            await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

            // Mine to next epoch
            await casperEpochIncrementAmount(owner, 1);

            // Get average CPU load
            // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
            // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
            let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

            // Perform checkin, to assign the minipool to the first node for launch
            await scenarioNodeCheckin({
                averageLoad: averageLoad15mins,
                fromAddress: nodeFirst,
            });

            // Set the minipool staking duration to 0 for testing so it will attempt to request logout from Casper
            await rocketPool.setPoolStakingDuration(miniPools.second.address, 0, { from: owner, gas: 150000 });

            // register another node
            let validationSecondTx = await sendDeployValidationContract(nodeSecond);
            let nodeSecondValCodeAddress = validationSecondTx.contractAddress;
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

            // use that node's address to try to log out a minipool that is not assigned to it
            let notFirstNode = nodeSecond;
            await assertThrows(
                scenarioNodeLogout({
                    nodeAddress: nodeSecond,
                    minipoolAddress: miniPools.second.address,
                    gas: nodeLogoutGas
                })
            );
        });

        it(printTitle('registered node', 'cannot logout a minipool if it has not finished staking'), async () => {

            // bring up a minipool
            miniPools.third = await initialiseMiniPool({fromAddress: userFirst});

            // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
            await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

            // Get average CPU load
            // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
            // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
            let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

            // Perform checkin, to assign the minipool to the first node for launch
            await scenarioNodeCheckin({
                averageLoad: averageLoad15mins,
                fromAddress: nodeFirst,
            });

            // log out of the minipool, when still staking
            let notFirstNode = nodeSecond;
            await assertThrows(
                scenarioNodeLogout({
                    nodeAddress: nodeFirst,
                    minipoolAddress: miniPools.third.address,
                    gas: nodeLogoutGas
                })
            );
        });

    });
}