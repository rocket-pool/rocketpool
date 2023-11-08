import { printTitle } from '../_utils/formatting';
import {
    bootstrapTreasuryNewContract, bootstrapTreasuryUpdateContract,
} from './scenario-dao-protocol-bootstrap';

// Contracts
import { getCurrentTime, increaseTime } from '../_utils/evm';
import { upgradeOneDotThree } from '../_utils/upgrade';
import { payOutContracts, withdrawBalance } from './scenario-dao-protocol-treasury';
import { shouldRevert } from '../_utils/testing';
import { RocketTokenRPL, RocketVault } from '../_utils/artifacts';
import { mintRPL } from '../_helpers/tokens';
import { assertBN } from '../_helpers/bn';

export default function() {
    contract('RocketDAOProtocol', async (accounts) => {

        // Accounts
        const [
            owner,
            recipient1,
            recipient2,
            random,
        ] = accounts;

        const oneDay = 60 * 60 * 24;

        // Setup
        before(async () => {
            // Upgrade to Houston
            await upgradeOneDotThree();
        });

        async function fundTreasury(amount) {
            await mintRPL(owner, owner, amount);
            const rocketVault = await RocketVault.deployed();
            const rocketTokenRPL = await RocketTokenRPL.deployed();
            await rocketTokenRPL.approve(rocketVault.address, amount, {from: owner});
            await rocketVault.depositToken("rocketClaimDAO", rocketTokenRPL.address, amount);
        }

        //
        // Start Tests
        //

        it(printTitle('guardian', 'can create a new recurring payment and update it via bootstrap'), async () => {
            const currentTime = await getCurrentTime(hre.web3);
            await bootstrapTreasuryNewContract("Test contract", recipient1, '5'.ether, oneDay, currentTime, 1, { from: owner });
            await bootstrapTreasuryUpdateContract("Test contract", recipient1, '10'.ether, oneDay, 1, { from: owner });
        });


        it(printTitle('recipient', 'can payout and withdraw RPL from a recurring contract'), async () => {
            // Send RPL to treasury
            await fundTreasury('10'.ether);
            // Create a new contract for 5 RPL/day
            const currentTime = await getCurrentTime(hre.web3);
            await bootstrapTreasuryNewContract("Test contract", recipient1, '5'.ether, oneDay, currentTime, 2, { from: owner });
            // Wait a day
            await increaseTime(hre.web3, oneDay + 1);
            // Execute a payout
            await payOutContracts(["Test contract"], {from: recipient1});
            // Wait another day
            await increaseTime(hre.web3, oneDay + 1);
            // Execute another payout
            await payOutContracts(["Test contract"], {from: recipient1});
            // Try to withdraw 2 days worth of payments
            await withdrawBalance(recipient1, {from: recipient1});
        });


        it(printTitle('recipient', 'can payout multiple periods of a recurring payment at once'), async () => {
            // Send RPL to treasury
            await fundTreasury('20'.ether);
            // Create a new contract for 5 RPL/day
            const currentTime = await getCurrentTime(hre.web3);
            await bootstrapTreasuryNewContract("Test contract", recipient1, '5'.ether, oneDay, currentTime, 4, { from: owner });
            // Wait 10 days
            await increaseTime(hre.web3, (oneDay * 10) + 1);
            // Payout and withdraw the 4 periods of payments
            await payOutContracts(["Test contract"], {from: recipient1});
            const amountWithdrawn = await withdrawBalance(recipient1, {from: recipient1});
            // Check result
            assertBN.equal(amountWithdrawn, '20'.ether, 'Unexpected amount withdrawn');
        });


        it(printTitle('recipient', 'can payout multiple contracts at once'), async () => {
            // Send RPL to treasury
            await fundTreasury('20'.ether);
            // Create a new contract for 5 RPL/day
            const currentTime = await getCurrentTime(hre.web3);
            await bootstrapTreasuryNewContract("Test contract 1", recipient1, '5'.ether, oneDay, currentTime, 1, { from: owner });
            await bootstrapTreasuryNewContract("Test contract 2", recipient1, '10'.ether, oneDay, currentTime, 1, { from: owner });
            // Wait a day
            await increaseTime(hre.web3, oneDay + 1);
            // Try to withdraw 4 days worth of payments
            await payOutContracts(["Test contract 1", "Test contract 2"], {from: recipient1});
            const amountWithdrawn = await withdrawBalance(recipient1, {from: recipient1});
            // Check result
            assertBN.equal(amountWithdrawn, '15'.ether, 'Unexpected amount withdrawn');
        });


        it(printTitle('recipient', 'can payout multiple contracts separately'), async () => {
            // Send RPL to treasury
            await fundTreasury('20'.ether);
            // Create a new contract for 5 RPL/day
            const currentTime = await getCurrentTime(hre.web3);
            await bootstrapTreasuryNewContract("Test contract 1", recipient1, '5'.ether, oneDay, currentTime, 1, { from: owner });
            await bootstrapTreasuryNewContract("Test contract 2", recipient1, '10'.ether, oneDay, currentTime, 1, { from: owner });
            // Wait a day
            await increaseTime(hre.web3, oneDay + 1);
            // Try to withdraw 4 days worth of payments from 1st contract
            await payOutContracts(["Test contract 1"], {from: recipient1});
            const amountWithdrawn1 = await withdrawBalance(recipient1, {from: recipient1});
            // Check result
            assertBN.equal(amountWithdrawn1, '5'.ether, 'Unexpected amount withdrawn');
            // Try to withdraw 4 days worth of payments from 2nd contract
            await payOutContracts(["Test contract 2"], {from: recipient1});
            const amountWithdrawn2 = await withdrawBalance(recipient1, {from: recipient1});
            // Check result
            assertBN.equal(amountWithdrawn2, '10'.ether, 'Unexpected amount withdrawn');
        });


        it(printTitle('recipient', 'receives back pay when contract is updated'), async () => {
            // Send RPL to treasury
            await fundTreasury('20'.ether);
            // Create a new contract for 5 RPL/day
            const currentTime = await getCurrentTime(hre.web3);
            await bootstrapTreasuryNewContract("Test contract", recipient1, '5'.ether, oneDay, currentTime, 2, { from: owner });
            // Wait a day
            await increaseTime(hre.web3, oneDay + 1);
            // Change recipient
            await bootstrapTreasuryUpdateContract("Test contract", recipient2, '5'.ether, oneDay, 2, { from: owner });
            // Wait a day
            await increaseTime(hre.web3, oneDay + 1);
            // Payout and withdraw from original recipient and new one
            await payOutContracts(["Test contract"], {from: recipient1});
            const amountWithdrawn1 = await withdrawBalance(recipient1, {from: recipient1});
            const amountWithdrawn2 = await withdrawBalance(recipient2, {from: recipient2});
            // Check result
            assertBN.equal(amountWithdrawn1, '5'.ether, 'Unexpected amount withdrawn');
            assertBN.equal(amountWithdrawn2, '5'.ether, 'Unexpected amount withdrawn');
        });


        it(printTitle('recipient', 'cannot withdraw RPL if treasury cannot afford it'), async () => {
            // Create a new contract for 5 RPL/day
            const currentTime = await getCurrentTime(hre.web3);
            await bootstrapTreasuryNewContract("Test contract", recipient1, '5'.ether, oneDay, currentTime, 1, { from: owner });
            // Wait a day
            await increaseTime(hre.web3, oneDay + 1);
            // Execute a payout
            await payOutContracts(["Test contract"], {from: recipient1});
            // Try to withdraw (and fail)
            await shouldRevert(withdrawBalance(recipient1, {from: recipient1}), 'Was able to withdraw in excess of treasury', 'Insufficient treasury balance for withdrawal');
        });
    });
}

