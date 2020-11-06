import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { mintDummyRPL } from './scenario-rpl-mint-fixed';
import { burnFixedRPL } from './scenario-rpl-burn-fixed';
import { allowDummyRPL } from './scenario-rpl-allow-fixed';
import { rplInflationIntervalRateSet, rplInflationIntervalBlocksSet, rplInflationStartBlockSet, rplClaimInflation } from './scenario-rpl-inflation';

// Contracts
import { RocketTokenRPL } from '../_utils/artifacts';


export default function() {
    contract('RocketTokenRPL', async (accounts) => {


        // Accounts
        const [
            owner,
            userOne,
            userTwo,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });

        // Load contracts
        const rocketTokenRPL = null;

        // Setup
        let userOneRPLBalance = web3.utils.toBN(web3.utils.toWei('100', 'ether'));

        before(async () => {

            // Mint RPL fixed supply for the users to simulate current users having RPL
            await mintDummyRPL(userOne, userOneRPLBalance, {from: owner});

        });

        
        it(printTitle('userOne', 'burn all their current fixed supply RPL for new RPL'), async () => {

            // Load contracts
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            // Give allowance for all to be sent
            await allowDummyRPL(rocketTokenRPL.address, userOneRPLBalance, {
                from: userOne,
            });
            // Burn existing fixed supply RPL for new RPL
            await burnFixedRPL(userOneRPLBalance, {
                from: userOne,
            });

        });


        it(printTitle('userOne', 'burn less fixed supply RPL than they\'ve given an allowance for'), async () => {

            // Load contracts
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            // The allowance
            let allowance = userOneRPLBalance.div(web3.utils.toBN(2));
            // Give allowance for half to be spent
            await allowDummyRPL(rocketTokenRPL.address, allowance, {
                from: userOne,
            });
            // Burn existing fixed supply RPL for new RPL
            await burnFixedRPL(allowance.sub(web3.utils.toBN(web3.utils.toWei('0.000001', 'ether'))), {
                from: userOne,
            });

        });

        it(printTitle('userOne', 'fails to burn more fixed supply RPL than they\'ve given an allowance for'), async () => {

             // Load contracts
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            // The allowance
            let allowance = userOneRPLBalance.sub(web3.utils.toBN(web3.utils.toWei('0.000001', 'ether')));
            // Give allowance for all to be sent
            await allowDummyRPL(rocketTokenRPL.address, allowance, {
                from: userOne,
            });
            // Burn existing fixed supply RPL for new RPL
            await shouldRevert(burnFixedRPL(userOneRPLBalance, {
                from: userOne,
            }), 'Burned more RPL than had gave allowance for');

        });

        it(printTitle('userOne', 'fails to burn more fixed supply RPL than they have'), async () => {

            // Load contracts
           const rocketTokenRPL = await RocketTokenRPL.deployed();
           // The allowance
           let allowance = userOneRPLBalance;
           // Give allowance for all to be sent
           await allowDummyRPL(rocketTokenRPL.address, allowance, {
               from: userOne,
           });
           // Burn existing fixed supply RPL for new RPL
           await shouldRevert(burnFixedRPL(userOneRPLBalance.add(web3.utils.toBN(web3.utils.toWei('0.000001', 'ether'))), {
               from: userOne,
           }), 'Burned more RPL than had owned and had given allowance for');

        });

        it(printTitle('userOne', 'fails to set start block for inflation'), async () => {
            // Current block
            let currentBlock = await web3.eth.getBlockNumber();
            // Set the start block for inflation
            await shouldRevert(rplInflationStartBlockSet(parseInt(currentBlock)+10, {
                from: userOne,
            }), 'Non owner set start block for inlfation');
        });

        it(printTitle('owner', 'succeeds setting future start block for inflation'), async () => {
            // Current block
            let currentBlock = await web3.eth.getBlockNumber();
            // Set the start block for inflation
            await rplInflationStartBlockSet(parseInt(currentBlock)+10, {
                from: owner,
            });
        });

        it(printTitle('owner', 'succeeds setting future start block for inflation twice'), async () => {
            // Current block
            let currentBlock = await web3.eth.getBlockNumber();
            // Set the start block for inflation
            await rplInflationStartBlockSet(parseInt(currentBlock)+10, {
                from: owner,
            });
            // Current block
            currentBlock = await web3.eth.getBlockNumber();
            // Set the start block for inflation
            await rplInflationStartBlockSet(parseInt(currentBlock)+10, {
                from: owner,
            });
        });

        it(printTitle('owner', 'fails to set start block for inflation less than current block'), async () => {
            // Current block
            let currentBlock = await web3.eth.getBlockNumber();
            // Set the start block for inflation
            await shouldRevert(rplInflationStartBlockSet(parseInt(currentBlock)-1, {
                from: owner,
            }), 'Owner set old start block for inflation');
        });

        it(printTitle('owner', 'fails to set start block for inflation after inflation has begun'), async () => {
            // Current block
            let currentBlock = await web3.eth.getBlockNumber();
            // Inflation start block
            let inflationStartBlock = parseInt(currentBlock)+10;
            // Set the start block for inflation
            await rplInflationStartBlockSet(inflationStartBlock, {
                from: owner,
            });
            // Fast forward to when inflation has begun
            await mineBlocks(web3, inflationStartBlock+1);
            // Current block
            currentBlock = await web3.eth.getBlockNumber();
            // Set the start block for inflation
            await shouldRevert(rplInflationStartBlockSet(parseInt(currentBlock)+10, {
                from: owner,
            }), 'Owner set start block for inflation after it had started');
        });



        it(printTitle('userOne', 'fail to mint inflation before inflation start block has passed'), async () => {

            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();

            let config = {
                blockInterval: 1,
                blockStart: blockCurrent + 30,
                blockClaim: blockCurrent + 20,
                yearlyInflationTarget: 0.05
            }

            // Set the daily inflation start block
            await rplInflationStartBlockSet(config.blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(config.blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(config.yearlyInflationTarget, { from: owner });

            // Run the test now
            await shouldRevert(rplClaimInflation(config.blockClaim, { from: userOne }, 'Inflation claimed before start block has passed'));

        });

        
        it(printTitle('userOne', 'fail to mint inflation same block as inflation start block'), async () => {

            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();

            let config = {
                blockInterval: 1,
                blockStart: blockCurrent + 20,
                blockClaim: blockCurrent + 20,
                yearlyInflationTarget: 0.05
            }

            // Set the daily inflation start block
            await rplInflationStartBlockSet(config.blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(config.blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(config.yearlyInflationTarget, { from: owner });

            // Run the test now
            await shouldRevert(rplClaimInflation(config.blockClaim, { from: userOne }, 'Inflation claimed at start block'));

        });


        it(printTitle('userOne', 'fail to mint inflation before an interval has passed'), async () => {

            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();

            let config = {
                blockInterval: 2,
                blockStart: blockCurrent + 50,
                blockClaim: blockCurrent + 51,
                yearlyInflationTarget: 0.05
            }

            // Set the daily inflation start block
            await rplInflationStartBlockSet(config.blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(config.blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(config.yearlyInflationTarget, { from: owner });

            // Run the test now
            await shouldRevert(rplClaimInflation(config.blockClaim, { from: userOne }, 'Inflation claimed before interval has passed'));

        });
        

        it(printTitle('userOne', 'mint inflation after a single interval has passed'), async () => {

            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();

            let config = {
                blockInterval: 2,
                blockStart: blockCurrent + 20,
                blockClaim: blockCurrent + 22,
                yearlyInflationTarget: 0.05
            }

            // Set the daily inflation start block
            await rplInflationStartBlockSet(config.blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(config.blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(config.yearlyInflationTarget, { from: owner });

            // Mint inflation now
            await rplClaimInflation(config, { from: userOne });

        });


        it(printTitle('userOne', 'mint inflation at multiple random intervals'), async () => {

            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();

            let config = {
                blockInterval: 3,
                blockStart: blockCurrent + 10,
                blockClaim: blockCurrent + 22,
                yearlyInflationTarget: 0.025
            }

            // Set the daily inflation start block
            await rplInflationStartBlockSet(config.blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(config.blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(config.yearlyInflationTarget, { from: owner });

            // Mint inflation now
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += 3;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += 10;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += 67;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += 105;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += 149;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += 151;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += 155;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += 219;
            await rplClaimInflation(config, { from: userOne });

        });
        


        it(printTitle('userOne', 'mint one years inflation after 365 days at 5% which would equal 18,900,000 tokens'), async () => {

            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();

            let config = {
                blockInterval: 2,
                blockStart: blockCurrent + 50,
                yearlyInflationTarget: 0.05
            }

            // Set the daily inflation start block
            await rplInflationStartBlockSet(config.blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(config.blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(config.yearlyInflationTarget, { from: owner });

            // Mint inflation now
            config.blockClaim = config.blockStart + (365 * config.blockInterval);
            await rplClaimInflation(config, { from: userOne }, 18900000);


        });

        
        it(printTitle('userOne', 'mint one years inflation every quarter at 5% which would equal 18,900,000 tokens'), async () => {

            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();

            let config = {
                blockInterval: 2,
                blockStart: blockCurrent + 50,
                blockClaim: blockCurrent + 52, // 365 is an uneven number, so add one extra interval at the start
                yearlyInflationTarget: 0.05
            }

            // How many intervals to make a year
            let totalYearBlocks = config.blockInterval * 365;
            let quarterlyBlockAmount = totalYearBlocks / 4;

            // Set the daily inflation start block
            await rplInflationStartBlockSet(config.blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(config.blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(config.yearlyInflationTarget, { from: owner });

            // Mint inflation now
            config.blockClaim += quarterlyBlockAmount;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += quarterlyBlockAmount;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += quarterlyBlockAmount;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += quarterlyBlockAmount;
            await rplClaimInflation(config, { from: userOne }, 18900000);

        });

        
        it(printTitle('userTwo', 'mint two years inflation every 6 months at 5% which would equal 19,845,000 tokens'), async () => {

            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();

            let config = {
                blockInterval: 2,
                blockStart: blockCurrent + 50,
                blockClaim: blockCurrent + 54, // 365 is an uneven number, so add two extra intervals at the start to account for 2 years
                yearlyInflationTarget: 0.05
            }

            // How many intervals to make a year
            let totalYearBlocks = config.blockInterval * 730;
            let quarterlyBlockAmount = totalYearBlocks / 4;

            // Set the daily inflation start block
            await rplInflationStartBlockSet(config.blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(config.blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(config.yearlyInflationTarget, { from: owner });

            // Mint inflation now
            config.blockClaim += quarterlyBlockAmount;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += quarterlyBlockAmount;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += quarterlyBlockAmount;
            await rplClaimInflation(config, { from: userOne });
            config.blockClaim += quarterlyBlockAmount;
            await rplClaimInflation(config, { from: userOne }, 19845000);

        });
        

        it(printTitle('userOne', 'mint one years inflation, then set inflation rate to 0 to prevent new inflation'), async () => {

            // Current block
            let blockCurrent = await web3.eth.getBlockNumber();

            let config = {
                blockInterval: 1,
                blockStart: blockCurrent + 50,
                yearlyInflationTarget: 0.05
            }

            // Set the daily inflation start block
            await rplInflationStartBlockSet(config.blockStart, { from: owner });
            // Set the daily inflation block count
            await rplInflationIntervalBlocksSet(config.blockInterval, { from: owner });
            // Set the daily inflation rate
            await rplInflationIntervalRateSet(config.yearlyInflationTarget, { from: owner });

            // Mint inflation now
            config.blockClaim = config.blockStart + (365 * config.blockInterval);
            await rplClaimInflation(config, { from: userOne }, 18900000);

            // Now set inflation to 0
            await rplInflationIntervalRateSet(0, { from: owner });

            // Attempt to collect inflation
            config.blockClaim = config.blockStart + (720 * config.blockInterval);
            await shouldRevert(rplClaimInflation(config, { from: userOne }), "Minted inflation after rate set to 0");

        });


    });
}
