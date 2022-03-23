import { takeSnapshot, revertSnapshot, getCurrentTime, increaseTime } from '../_utils/evm'
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { mintDummyRPL } from './scenario-rpl-mint-fixed';
import { burnFixedRPL } from './scenario-rpl-burn-fixed';
import { allowDummyRPL } from './scenario-rpl-allow-fixed';
import { rplClaimInflation, rplSetInflationConfig } from './scenario-rpl-inflation'
import { setRPLInflationIntervalRate, setRPLInflationStartTime } from '../dao/scenario-dao-protocol-bootstrap';

// Contracts
import { GoGoTokenGGP } from '../_utils/artifacts';


export default function() {
    contract('GoGoTokenGGP', async (accounts) => {


        // Accounts
        const [
            owner,
            userOne,
        ] = accounts;

        // One day in seconds
        const ONE_DAY = 24 * 60 * 60;


        // Setup
        let userOneRPLBalance = web3.utils.toBN(web3.utils.toWei('100', 'ether'));


        before(async () => {
            // Mint RPL fixed supply for the users to simulate current users having RPL
            await mintDummyRPL(userOne, userOneRPLBalance, {from: owner});
        });

        
        it(printTitle('userOne', 'burn all their current fixed supply RPL for new RPL'), async () => {
            // Load contracts
            const gogoTokenGGP = await GoGoTokenGGP.deployed();
            // Give allowance for all to be sent
            await allowDummyRPL(gogoTokenGGP.address, userOneRPLBalance, {
                from: userOne,
            });
            // Burn existing fixed supply RPL for new RPL
            await burnFixedRPL(userOneRPLBalance, {
                from: userOne,
            });
        });


        it(printTitle('userOne', 'burn less fixed supply RPL than they\'ve given an allowance for'), async () => {
            // Load contracts
            const gogoTokenGGP = await GoGoTokenGGP.deployed();
            // The allowance
            let allowance = userOneRPLBalance.div(web3.utils.toBN(2));
            // Give allowance for half to be spent
            await allowDummyRPL(gogoTokenGGP.address, allowance, {
                from: userOne,
            });
            // Burn existing fixed supply RPL for new RPL
            await burnFixedRPL(allowance.sub(web3.utils.toBN(web3.utils.toWei('0.000001', 'ether'))), {
                from: userOne,
            });
        });


        it(printTitle('userOne', 'fails to burn more fixed supply RPL than they\'ve given an allowance for'), async () => {
             // Load contracts
            const gogoTokenGGP = await GoGoTokenGGP.deployed();
            // The allowance
            let allowance = userOneRPLBalance.sub(web3.utils.toBN(web3.utils.toWei('0.000001', 'ether')));
            // Give allowance for all to be sent
            await allowDummyRPL(gogoTokenGGP.address, allowance, {
                from: userOne,
            });
            // Burn existing fixed supply RPL for new RPL
            await shouldRevert(burnFixedRPL(userOneRPLBalance, {
                from: userOne,
            }), 'Burned more RPL than had gave allowance for');
        });


        it(printTitle('userOne', 'fails to burn more fixed supply RPL than they have'), async () => {
            // Load contracts
           const gogoTokenGGP = await GoGoTokenGGP.deployed();
           // The allowance
           let allowance = userOneRPLBalance;
           // Give allowance for all to be sent
           await allowDummyRPL(gogoTokenGGP.address, allowance, {
               from: userOne,
           });
           // Burn existing fixed supply RPL for new RPL
           await shouldRevert(burnFixedRPL(userOneRPLBalance.add(web3.utils.toBN(web3.utils.toWei('0.000001', 'ether'))), {
               from: userOne,
           }), 'Burned more RPL than had owned and had given allowance for');
        });


        it(printTitle('userOne', 'fails to set start time for inflation'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Set the start time for inflation
            await shouldRevert(setRPLInflationStartTime(parseInt(currentTime)+3600, {
                from: userOne,
            }), 'Non owner set start time for inflation');
        });


        it(printTitle('guardian', 'succeeds setting future start time for inflation'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Set the start time for inflation
            await setRPLInflationStartTime(parseInt(currentTime)+3600, {
                from: owner,
            });
        });


        it(printTitle('guardian', 'succeeds setting future start time for inflation twice'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Set the start time for inflation
            await setRPLInflationStartTime(parseInt(currentTime)+3600, {
                from: owner,
            });
            // Fast-forward
            await increaseTime(web3, 1800);
            // Current time
            currentTime = await getCurrentTime(web3);
            // Set the start time for inflation
            await setRPLInflationStartTime(parseInt(currentTime)+3600, {
                from: owner,
            });
        });


        it(printTitle('guardian', 'fails to set start time for inflation less than current time'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Set the start block for inflation
            await shouldRevert(setRPLInflationStartTime(parseInt(currentTime)-1800, {
                from: owner,
            }), 'Owner set old start block for inflation');
        });


        it(printTitle('guardian', 'fails to set start time for inflation after inflation has begun'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);
            // Inflation start time
            let inflationStartTime = parseInt(currentTime)+3600;
            // Set the start time for inflation
            await setRPLInflationStartTime(inflationStartTime, {
                from: owner,
            });
            // Fast forward to when inflation has begun
            await increaseTime(web3, inflationStartTime+60)
            // Current time
            currentTime = await getCurrentTime(web3);
            // Set the start block for inflation
            await shouldRevert(setRPLInflationStartTime(parseInt(currentTime)+3600, {
                from: owner,
            }), 'Owner set start block for inflation after it had started');
        });


        it(printTitle('userOne', 'fail to mint inflation before inflation start block has passed'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);

            let config = {
                timeStart: currentTime + 3600,
                timeClaim: currentTime + 1800,
                yearlyInflationTarget: 0.05
            }

            // Set config
            await rplSetInflationConfig(config, { from: owner });

            // Run the test now
            const newTokens = await rplClaimInflation(config, { from: userOne });
            assert(newTokens.eq(web3.utils.toBN(0)), 'Inflation claimed before start block has passed')
        });

        
        it(printTitle('userOne', 'fail to mint inflation before an interval has passed'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);

            let config = {
                timeStart: currentTime + 1800,
                timeClaim: currentTime + 3600,      // Mid way through first interval
                yearlyInflationTarget: 0.05
            }

            // Set config
            await rplSetInflationConfig(config, { from: owner });

            // Run the test now
            const newTokens = await rplClaimInflation(config, { from: userOne });
            assert(newTokens.eq(web3.utils.toBN(0)), 'Inflation claimed before interval has passed');
        });
        

        it(printTitle('userOne', 'mint inflation midway through a second interval, then mint again after another interval'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);

            let config = {
                timeInterval: ONE_DAY,
                timeStart: currentTime + ONE_DAY,
                timeClaim: currentTime + (ONE_DAY*2.5),      // Claimm mid way through second interval
                yearlyInflationTarget: 0.05
            }

            // Set config
            await rplSetInflationConfig(config, { from: owner });

            // Claim inflation half way through the second interval
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += config.timeInterval;
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += config.timeInterval;
            await rplClaimInflation(config, { from: userOne });
        });
        

        it(printTitle('userOne', 'mint inflation at multiple random intervals'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);

            const INTERVAL = ONE_DAY
            const HALF_INTERVAL = INTERVAL/2

            let config = {
                timeInterval: INTERVAL,
                timeStart: currentTime + INTERVAL,
                timeClaim: currentTime + (INTERVAL*5),
                yearlyInflationTarget: 0.025
            }

            // Set config
            await rplSetInflationConfig(config, { from: owner });

            // Mint inflation now
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_INTERVAL * 3;
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_INTERVAL * 10;
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_INTERVAL * 20;
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_INTERVAL * 24;
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_INTERVAL * 32;
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_INTERVAL * 38;
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_INTERVAL * 53;
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_INTERVAL * 70;
            await rplClaimInflation(config, { from: userOne });
        });
        
        
        it(printTitle('userOne', 'mint one years inflation after 365 days at 5% which would equal 18,900,000 tokens'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);

            const ONE_DAY = 24 * 60 * 60

            let config = {
                timeInterval: ONE_DAY,
                timeStart: currentTime + ONE_DAY,
                timeClaim: currentTime + ONE_DAY + (ONE_DAY * 365),
                yearlyInflationTarget: 0.05
            }

            // Set config
            await rplSetInflationConfig(config, { from: owner });

            // Mint inflation now
            await rplClaimInflation(config, { from: userOne }, '18900000');
        });
       
        
        it(printTitle('userOne', 'mint one years inflation every quarter at 5% which would equal 18,900,000 tokens'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);

            const ONE_DAY = 24 * 60 * 60
            const QUARTER_YEAR = ONE_DAY * 365 / 4

            let config = {
                timeInterval: ONE_DAY,
                timeStart: currentTime + ONE_DAY,
                timeClaim: currentTime + ONE_DAY + QUARTER_YEAR,
                yearlyInflationTarget: 0.05
            }

            // Set config
            await rplSetInflationConfig(config, { from: owner });

            // Mint inflation now
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += QUARTER_YEAR
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += QUARTER_YEAR
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += QUARTER_YEAR
            await rplClaimInflation(config, { from: userOne }, '18900000');
        });

        
        it(printTitle('userTwo', 'mint two years inflation every 6 months at 5% which would equal 19,845,000 tokens'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);

            const ONE_DAY = 24 * 60 * 60
            const HALF_YEAR = ONE_DAY * 365 / 2

            let config = {
                timeInterval: ONE_DAY,
                timeStart: currentTime + ONE_DAY,
                timeClaim: currentTime + ONE_DAY + HALF_YEAR,
                yearlyInflationTarget: 0.05
            }

            // Set config
            await rplSetInflationConfig(config, { from: owner });

            // Mint inflation now
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_YEAR
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_YEAR
            await rplClaimInflation(config, { from: userOne });
            config.timeClaim += HALF_YEAR
            await rplClaimInflation(config, { from: userOne }, '19845000');
        });


        it(printTitle('userOne', 'mint one years inflation, then set inflation rate to 0 to prevent new inflation'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);

            const ONE_DAY = 24 * 60 * 60

            let config = {
                timeInterval: ONE_DAY,
                timeStart: currentTime + ONE_DAY,
                timeClaim: currentTime + ONE_DAY + (ONE_DAY * 365),
                yearlyInflationTarget: 0.05
            }

            // Set config
            await rplSetInflationConfig(config, { from: owner });

            // Mint inflation now
            await rplClaimInflation(config, { from: userOne }, '18900000');

            // Now set inflation to 0
            await setRPLInflationIntervalRate(0, { from: owner });
            config.yearlyInflationTarget = 0;

            // Attempt to collect inflation
            config.timeClaim += (ONE_DAY * 365);
            const newTokens = await rplClaimInflation(config, { from: userOne });
            assert(newTokens.eq(web3.utils.toBN(0)), "Minted inflation after rate set to 0");
        });


        it(printTitle('userOne', 'mint one years inflation, then set inflation rate to 0 to prevent new inflation, then set inflation back to 5% for another year'), async () => {
            // Current time
            let currentTime = await getCurrentTime(web3);

            const ONE_DAY = 24 * 60 * 60

            let config = {
                timeInterval: ONE_DAY,
                timeStart: currentTime + ONE_DAY,
                timeClaim: currentTime + ONE_DAY + (ONE_DAY * 365),
                yearlyInflationTarget: 0.05
            }

            // Set config
            await rplSetInflationConfig(config, { from: owner });

            // Mint inflation now
            await rplClaimInflation(config, { from: userOne }, '18900000');

            // Now set inflation to 0
            await setRPLInflationIntervalRate(0, { from: owner });
            config.yearlyInflationTarget = 0;
            config.timeClaim += (ONE_DAY * 365);
            await rplClaimInflation(config, { from: userOne }, '18900000');

            // Now set inflation back to 5%
            await setRPLInflationIntervalRate(0.05, { from: owner });
            config.yearlyInflationTarget = 0.05;
            config.timeClaim += (ONE_DAY * 365);
            await rplClaimInflation(config, { from: userOne }, '19845000');
        });
    });
}
