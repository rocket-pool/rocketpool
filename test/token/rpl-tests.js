import { takeSnapshot, revertSnapshot, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { mintDummyRPL } from './scenario-rpl-mint-fixed';
import { burnFixedRPL } from './scenario-rpl-burn-fixed';
import { allowDummyRPL } from './scenario-rpl-allow-fixed';
import { rplCalcInflation, rplInflationIntervalBlocksGet, rplInflationIntervalBlocksSet } from './scenario-rpl-inflation';
import { getNethBalance } from '../_helpers/tokens';

// Contracts
import { RocketTokenRPL } from '../_utils/artifacts';


export default function() {
    contract.only('RocketTokenRPL', async (accounts) => {


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

        /*
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
        */

            
        it(printTitle('rpl', 'calc inflation'), async () => {

            // Calculate inflation daily with 5% (0.05) yearly inflation
            // let dailyInflation = web3.utils.toBN((1 + 0.05) ** (1 / (365)) * 1e18);

            // How many blocks to pass each time inflation is calculated, based on daily inflation formula above
            // So we are assuming the amount of blocks below represents 1 days inflation (obv a lot shorter than reality for testing purposes)
            
            const daysToSimulate = 2;
            const inflationIntervalDailyBlocks = 4;
            const inflationYearlyTarget = 0.05;

            /*
            // Set it now as the DAO 
            await rplInflationIntervalBlocksSet(inflationIntervalBlocks, { from: owner })
            // Get the inlfation interval in blocks
            const inflationIntervalBlocksCurrent = await rplInflationIntervalBlocksGet({from: userOne});
            // Get the current block
            let startBlock = await web3.eth.getBlockNumber();
      
            console.log('BLOCK', startBlock);

            await mineBlocks(web3, inflationIntervalBlocksCurrent);
            */
            
            // Test
            await rplCalcInflation(daysToSimulate, inflationIntervalDailyBlocks, inflationYearlyTarget, {
                from: owner,
            });

           //console.log('BLOCK', await web3.eth.getBlockNumber());

        });
        

    });
}
