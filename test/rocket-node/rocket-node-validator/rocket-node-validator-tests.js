const os = require('os');

import { printTitle, assertThrows } from '../../utils';
import { RocketPool, RocketSettings, Casper, RocketPoolMini } from '../../artifacts';
import { initialiseMiniPool } from '../../rocket-user/rocket-user-utils';
import { scenarioIncrementEpoch, scenarioCreateValidationContract, scenarioIncrementDynasty } from '../../casper/casper-scenarios';
import { scenarioNodeCheckin } from '../rocket-node-status/rocket-node-status-scenarios';
import { scenarioRegisterNode } from '../rocket-node-admin/rocket-node-admin-scenarios';
import { scenarioNodeVoteCast, scenarioNodeLogout } from './rocket-node-validator-scenarios';

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
            casper = await Casper.deployed();

            
            // Initialise minipools
            miniPools.first = await initialiseMiniPool({fromAddress: userFirst});
            miniPools.second = await initialiseMiniPool({fromAddress: userSecond});

            // register first node
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

            // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
            await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

            // Get average CPU load
            // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
            // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
            let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

            // Perform checkin, to assign the minipool to the node for launch
            await scenarioNodeCheckin({
                averageLoad: averageLoad15mins,
                fromAddress: nodeFirst,
            });

            await scenarioIncrementEpoch(owner);
            await scenarioIncrementEpoch(owner);
            await scenarioIncrementDynasty(owner);
            await scenarioIncrementEpoch(owner);
            await scenarioIncrementEpoch(owner);
            await scenarioIncrementDynasty(owner);
            

        });

        it(printTitle('registered node', 'can cast a checkpoint vote with Casper'), async () => {  
            let epoch = await casper.get_current_epoch.call();
            let voteMessage = "0x76876868768768766876";
            await scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                epoch: epoch.valueOf(),
                minipoolAddress: miniPools.first.address,
                voteMessage: voteMessage,
                gas: nodeVotingGas
            });
        });


        it(printTitle('registered node', 'cannot cast a vote with an empty vote message'), async () => {
            let epoch = await casper.get_current_epoch.call();
            let emptyVoteMessage = "";
            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                epoch: epoch.valueOf(),
                minipoolAddress: miniPools.first.address,
                voteMessage: emptyVoteMessage,
                gas: nodeVotingGas
            }));
        });

        it(printTitle('registered node', 'can only cast a vote for a pool that it is attached to'), async () => {
            let epoch = await casper.get_current_epoch.call();
            let voteMessage = "0x76876868768768766876";
            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                epoch: epoch.valueOf(),
                minipoolAddress: miniPools.second.address, // not nodeFirst's minipool
                voteMessage: voteMessage,
                gas: nodeVotingGas
            }));
        });

        it(printTitle('registered node', 'must pass minipool address to vote'), async () => {
            let epoch = await casper.get_current_epoch.call();
            let voteMessage = "0x76876868768768766876";
            let nullAddress = "";
            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                epoch: epoch.valueOf(),
                minipoolAddress: nullAddress,
                voteMessage: voteMessage,
                gas: nodeVotingGas
            }));
        });

        xit(printTitle('registered node', 'cannot cast a vote in the first quarter of an epoch'), async () => {});

        it(printTitle('registered node', 'can only cast a vote for a pool that is staking'), async () => {
            // Set our pool launch timer to 1000 setting so that it will not trigger a minipool launch
            await rocketSettings.setMiniPoolCountDownTime(1000, {from: web3.eth.coinbase, gas: 500000});

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

            let epoch = await casper.get_current_epoch.call();
            let voteMessage = "0x76876868768768766876";
            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                epoch: epoch.valueOf(),
                minipoolAddress: miniPools.second.address,
                voteMessage: voteMessage,
                gas: nodeVotingGas
            }));
        });

                
        xit(printTitle('registered node', 'can only cast one vote per epoch'), async () => {   
            let epoch = await casper.get_current_epoch.call();
            let voteMessage = "0x76876868768768766876";
            await scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                epoch: epoch.valueOf(),
                minipoolAddress: miniPools.first.address,
                voteMessage: voteMessage,
                gas: nodeVotingGas
            });

            // for testing we need to tell dummy casper that the validator has voted
            let validatorIndex = await casper.get_validator_indexes.call(miniPools.first.address);
            await casper.set_voted(validatorIndex, epoch, {from: owner});

            // should fail because we are trying to vote twice for same epoch
            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                epoch: epoch.valueOf(),
                minipoolAddress: miniPools.first.address,
                voteMessage: voteMessage,
                gas: nodeVotingGas
            }));
        });

        xit(printTitle('registered node', 'can cast a during logout period but not after'), async () => {
            let voteMessage = "0x76876868768768766876";

            // move epoch forward because we voted in a previous test
            await scenarioIncrementEpoch(owner);

            // Set the minipool staking duration to 0 for testing so it will attempt to request logout from Casper
            await rocketPool.setPoolStakingDuration(miniPools.first.address, 0, { from: owner, gas: 150000 });
            
            // logout the minipool 
            let logoutMessage = '0x8779787998798798';
            await scenarioNodeLogout({
                nodeAddress: nodeFirst,
                minipoolAddress: miniPools.first.address, 
                logoutMessage: logoutMessage,
                gas: nodeLogoutGas
            });

            // move forward so we can vote again
            await scenarioIncrementEpoch(owner);

            // make sure we can still vote while we are waiting for logout
            let epoch = await casper.get_current_epoch.call();
            await scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                epoch: epoch.valueOf(),
                minipoolAddress: miniPools.first.address,
                voteMessage: voteMessage,
                gas: nodeVotingGas
            });

            // Forward Casper past our logout delay so that we are actually logged out
            // Currently default logout delay is 2 dynasties + 1 for luck
            let logoutDelayDynasties = await casper.get_dynasty_logout_delay.call({from: owner});
            for (let i = 0; i < (logoutDelayDynasties + 1); i++) {
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementEpoch(owner);
                await scenarioIncrementDynasty(owner);
            }

            epoch = await casper.get_current_epoch.call();            
            await assertThrows(scenarioNodeVoteCast({
                nodeAddress: nodeFirst,
                epoch: epoch.valueOf(),
                minipoolAddress: miniPools.first.address,
                voteMessage: voteMessage,
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
            casper = await Casper.deployed();

            // Initialise minipools
            miniPools.first = await initialiseMiniPool({fromAddress: userFirst});            

            // register first node
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

            // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
            await rocketSettings.setMiniPoolCountDownTime(0, {from: web3.eth.coinbase, gas: 500000});

            // Get average CPU load
            // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
            // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
            let averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

            // Perform checkin, to assign the minipool to the node for launch
            await scenarioNodeCheckin({
                averageLoad: averageLoad15mins,
                fromAddress: nodeFirst,
            });

        });

        it(printTitle('registered node', 'must provide a minipool address to logout'), async () =>{        
            let blankMiniPool = '';
            let logoutMessage = '0x87797879987987987';
            await assertThrows(
                scenarioNodeLogout({
                    nodeAddress: nodeFirst,
                    minipoolAddress: blankMiniPool, 
                    logoutMessage: logoutMessage,
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
                    logoutMessage: logoutMessage,
                    gas: nodeLogoutGas
                })
            );
        });

        it(printTitle('registered node', 'should be able to logout from Casper after staking period'), async () => {

            // Precheck minipool is a validator in Casper
            let casperValidatorIndex = await casper.get_validator_indexes.call(miniPools.first.address);
            assert.equal(casperValidatorIndex.valueOf(), 1, 'Invalid precheck validator index');
            // And the end dynasty is pretry much infinity
            let casperValidatorDynastyEnd = await casper.get_validators__dynasty_end.call(casperValidatorIndex);
            assert.isAbove(casperValidatorDynastyEnd.valueOf(), 10000000000000, 'Invalid precheck validator end dynasty');

            // Set the minipool staking duration to 0 for testing so it will attempt to request logout from Casper
            await rocketPool.setPoolStakingDuration(miniPools.first.address, 0, { from: owner, gas: 150000 });

            // Logout of Casper
            let logoutMessage = '0x8779787998798798';
            await scenarioNodeLogout({
                nodeAddress: nodeFirst,
                minipoolAddress: miniPools.first.address, 
                logoutMessage: logoutMessage,
                gas: nodeLogoutGas
            })

            // Should still be a validator
            casperValidatorIndex = await casper.get_validator_indexes.call(miniPools.first.address);
            assert.equal(casperValidatorIndex.valueOf(), 1, 'Invalid post check validator index');
            // But end dynasty should be set to: <current dynasty> + logout_delay_dynasty
            casperValidatorDynastyEnd = await casper.get_validators__dynasty_end.call(casperValidatorIndex);
            assert.isBelow(casperValidatorDynastyEnd.valueOf(), 10000000000000, 'Invalid post check validator end dynasty');

        });

        it(printTitle('registered node', 'can only log out a minipool that is assigned to it'), async () =>{

            // bring up a minipool
            miniPools.second = await initialiseMiniPool({fromAddress: userSecond});

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

            // Set the minipool staking duration to 0 for testing so it will attempt to request logout from Casper
            await rocketPool.setPoolStakingDuration(miniPools.second.address, 0, { from: owner, gas: 150000 });

            // register another node
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

            // use that node's address to try to log out a minipool that is not assigned to it
            let notFirstNode = nodeSecond;
            let logoutMessage = '0x8779787998798798';
            await assertThrows(
                scenarioNodeLogout({
                    nodeAddress: nodeSecond,
                    minipoolAddress: miniPools.second.address, 
                    logoutMessage: logoutMessage,
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
            let logoutMessage = '0x8779787998798798';
            await assertThrows(
                scenarioNodeLogout({
                    nodeAddress: nodeFirst,
                    minipoolAddress: miniPools.third.address, 
                    logoutMessage: logoutMessage,
                    gas: nodeLogoutGas
                })
            );
        });

    });
}