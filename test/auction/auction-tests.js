import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    RocketAuctionManager,
    RocketDAOProtocolSettingsAuction,
    RocketTokenRPL,
    RocketVault,
} from '../_utils/artifacts';
import { auctionCreateLot, auctionPlaceBid, getLotPriceAtBlock, getLotStartBlock } from '../_helpers/auction';
import { submitPrices } from '../_helpers/network';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { approveRPL, mintRPL } from '../_helpers/tokens';
import { createLot } from './scenario-create-lot';
import { placeBid } from './scenario-place-bid';
import { claimBid } from './scenario-claim-bid';
import { recoverUnclaimedRPL } from './scenario-recover-rpl';
import { assertBN } from '../_helpers/bn';
import { globalSnapShot } from '../_utils/snapshotting';
import { registerNode, setNodeTrusted } from '../_helpers/node';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketAuctionManager', () => {
        let owner,
            node,
            trustedNode,
            random1,
            random2;

        const auctionDuration = 7200;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                trustedNode,
                random1,
                random2,
            ] = await ethers.getSigners();

            // Set settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.duration', auctionDuration, { from: owner });
            // Register trusted node
            await registerNode({ from: trustedNode });
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);
        });

        it(printTitle('random address', 'cannot create a lot with an insufficient RPL balance'), async () => {
            // Attempt to create lot
            await shouldRevert(createLot({
                from: random1,
            }), 'Created a lot with an insufficient RPL balance');
        });

        describe('With RPL to auction', () => {
            const rplAmount = '1600'.ether;

            before(async () => {
                // Get contracts
                const rocketTokenRpl = await RocketTokenRPL.deployed();
                const rocketVault = await RocketVault.deployed();
                const rocketAuctionManager = await RocketAuctionManager.deployed();
                // Mint and send RPL to the auction manager
                await mintRPL(owner, owner, rplAmount);
                await approveRPL(rocketVault.target, rplAmount, { from: owner });
                await rocketVault.depositToken('rocketAuctionManager', rocketTokenRpl.target, rplAmount, { from: owner });
                // Verify RPL balance
                const rplBalance = await rocketAuctionManager.getTotalRPLBalance();
                assertBN.equal(rplAmount, rplBalance, 'Incorrect RPL balance');
            });

            it(printTitle('random address', 'can create a lot'), async () => {
                // Create first lot
                await createLot({
                    from: random1,
                });
                // Create second lot
                await createLot({
                    from: random1,
                });
            });

            it(printTitle('random address', 'cannot create a lot while lot creation is disabled'), async () => {
                // Disable lot creation
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', false, { from: owner });
                // Attempt to create lot
                await shouldRevert(createLot({
                    from: random1,
                }), 'Created a lot while lot creation was disabled');
            });

            it(printTitle('auction lot', 'has correct price at block'), async () => {
                // Set lot settings
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.duration', 100000, { from: owner });
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.price.start', '1'.ether, { from: owner });
                await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.price.reserve', '0.5'.ether, { from: owner });
                // Set RPL price
                let block = await ethers.provider.getBlockNumber();
                let slotTimestamp = '1600000000';
                await submitPrices(block, slotTimestamp, '1'.ether, { from: trustedNode });
                // Create lot
                await auctionCreateLot({ from: random1 });
                // Get lot start block
                const startBlock = parseInt(await getLotStartBlock(0));
                // Set expected prices at blocks
                const values = [
                    { block: startBlock + 0, expectedPrice: '1.00000'.ether },
                    { block: startBlock + 12000, expectedPrice: '0.99280'.ether },
                    { block: startBlock + 25000, expectedPrice: '0.96875'.ether },
                    { block: startBlock + 37000, expectedPrice: '0.93155'.ether },
                    { block: startBlock + 50000, expectedPrice: '0.87500'.ether },
                    { block: startBlock + 63000, expectedPrice: '0.80155'.ether },
                    { block: startBlock + 75000, expectedPrice: '0.71875'.ether },
                    { block: startBlock + 88000, expectedPrice: '0.61280'.ether },
                    { block: startBlock + 100000, expectedPrice: '0.50000'.ether },
                ];
                // Check fees
                for (let vi = 0; vi < values.length; ++vi) {
                    let v = values[vi];
                    let price = await getLotPriceAtBlock(0, v.block);
                    assertBN.equal(price, v.expectedPrice, 'Lot price does not match expected price at block');
                }
            });

            it(printTitle('random address', 'can place a bid on a lot'), async () => {
                // Create lots
                await auctionCreateLot({ from: random1 });
                await auctionCreateLot({ from: random1 });
                // Place bid on first lot from first address
                await placeBid(0, {
                    from: random1,
                    value: '4'.ether,
                });
                // Increase bid on first lot from first address
                await placeBid(0, {
                    from: random1,
                    value: '4'.ether,
                });
                // Place bid on first lot from second address
                await placeBid(0, {
                    from: random2,
                    value: '4'.ether,
                });
                // Place bid on second lot from first address
                await placeBid(1, {
                    from: random1,
                    value: '2'.ether,
                });
                // Increase bid on second lot from first address
                await placeBid(1, {
                    from: random1,
                    value: '2'.ether,
                });
                // Place bid on second lot from second address
                await placeBid(1, {
                    from: random2,
                    value: '2'.ether,
                });
            });

            it(printTitle('random address', 'can claim RPL from a lot'), async () => {
                // Create lots & place bids to clear
                await auctionCreateLot({ from: random1 });
                await auctionCreateLot({ from: random1 });
                await auctionPlaceBid(0, { from: random1, value: '5'.ether });
                await auctionPlaceBid(0, { from: random2, value: '5'.ether });
                await auctionPlaceBid(1, { from: random1, value: '3'.ether });
                await auctionPlaceBid(1, { from: random2, value: '3'.ether });
                // Claim RPL on first lot from first address
                await claimBid(0, {
                    from: random1,
                });
                // Claim RPL on first lot from second address
                await claimBid(0, {
                    from: random2,
                });
                // Claim RPL on second lot from first address
                await claimBid(1, {
                    from: random1,
                });
                // Claim RPL on second lot from second address
                await claimBid(1, {
                    from: random2,
                });
            });

            it(printTitle('random address', 'can recover unclaimed RPL from a lot'), async () => {
                // Create closed lots
                await auctionCreateLot({ from: random1 });
                await auctionCreateLot({ from: random1 });
                // Wait for duration to end
                await helpers.mine(auctionDuration);
                // Recover RPL from first lot
                await recoverUnclaimedRPL(0, {
                    from: random1,
                });
                // Recover RPL from second lot
                await recoverUnclaimedRPL(1, {
                    from: random1,
                });
            });

            describe('With Lot', () => {
                before(async () => {
                    // Create lot
                    await auctionCreateLot({ from: random1 });
                });

                it(printTitle('random address', 'cannot recover unclaimed RPL from a lot which has no RPL to recover'), async () => {
                    await auctionPlaceBid(0, { from: random1, value: '1000'.ether });
                    // Wait for duration to end
                    await helpers.mine(auctionDuration);
                    // Attempt to recover RPL again
                    await shouldRevert(recoverUnclaimedRPL(0, {
                        from: random1,
                    }), 'Recovered unclaimed RPL from a lot which had no RPL to recover');
                });

                it(printTitle('random address', 'cannot bid on a lot which doesn\'t exist'), async () => {
                    // Attempt to place bid
                    await shouldRevert(placeBid(1, {
                        from: random1,
                        value: '4'.ether,
                    }), 'Bid on a lot which doesn\'t exist');
                });

                it(printTitle('random address', 'cannot bid on a lot while bidding is disabled'), async () => {
                    // Disable bidding
                    await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.bidding.enabled', false, { from: owner });
                    // Attempt to place bid
                    await shouldRevert(placeBid(0, {
                        from: random1,
                        value: '4'.ether,
                    }), 'Bid on a lot while bidding was disabled');
                });

                it(printTitle('random address', 'cannot bid an invalid amount on a lot'), async () => {
                    // Attempt to place bid
                    await shouldRevert(placeBid(0, {
                        from: random1,
                        value: '0'.ether,
                    }), 'Bid an invalid amount on a lot');
                });

                it(printTitle('random address', 'cannot bid on a lot after the lot bidding period has concluded'), async () => {
                    // Wait for duration to end
                    await helpers.mine(auctionDuration);
                    // Attempt to place bid
                    await shouldRevert(placeBid(0, {
                        from: random1,
                        value: '4'.ether,
                    }), 'Bid on a lot after the bidding period concluded');
                });

                it(printTitle('random address', 'cannot bid on a lot after the RPL allocation has been exhausted'), async () => {
                    // Place bid & claim all RPL
                    await placeBid(0, {
                        from: random1,
                        value: '1000'.ether,
                    });
                    // Attempt to place bid
                    await shouldRevert(placeBid(0, {
                        from: random2,
                        value: '4'.ether,
                    }), 'Bid on a lot after the RPL allocation was exhausted');
                });

                it(printTitle('random address', 'cannot claim RPL from a lot which doesn\'t exist'), async () => {
                    await auctionPlaceBid(0, { from: random1, value: '1000'.ether });
                    // Attempt to claim RPL
                    await shouldRevert(claimBid(1, {
                        from: random1,
                    }), 'Claimed RPL from a lot which doesn\'t exist');
                });

                it(printTitle('random address', 'cannot claim RPL from a lot before it has cleared'), async () => {
                    await auctionPlaceBid(0, { from: random1, value: '4'.ether });
                    // Attempt to claim RPL
                    await shouldRevert(claimBid(0, {
                        from: random1,
                    }), 'Claimed RPL from a lot before it has cleared');
                });

                it(printTitle('random address', 'cannot claim RPL from a lot it has not bid on'), async () => {
                    await auctionPlaceBid(0, { from: random1, value: '1000'.ether });
                    // Attempt to claim RPL
                    await shouldRevert(claimBid(0, {
                        from: random2,
                    }), 'Address claimed RPL from a lot it has not bid on');
                });

                it(printTitle('random address', 'cannot recover unclaimed RPL from a lot which doesn\'t exist'), async () => {
                    // Wait for duration to end
                    await helpers.mine(auctionDuration);
                    // Attempt to recover RPL
                    await shouldRevert(recoverUnclaimedRPL(1, {
                        from: random1,
                    }), 'Recovered unclaimed RPL from a lot which doesn\'t exist');
                });

                it(printTitle('random address', 'cannot recover unclaimed RPL from a lot before the lot bidding period has concluded'), async () => {
                    // Attempt to recover RPL
                    await shouldRevert(recoverUnclaimedRPL(0, {
                        from: random1,
                    }), 'Recovered unclaimed RPL from a lot before its bidding period had concluded');
                });

                it(printTitle('random address', 'cannot recover unclaimed RPL from a lot twice'), async () => {
                    // Wait for duration to end
                    await helpers.mine(auctionDuration);
                    // Recover RPL
                    await recoverUnclaimedRPL(0, { from: random1 });
                    // Attempt to recover RPL again
                    await shouldRevert(recoverUnclaimedRPL(0, {
                        from: random1,
                    }), 'Recovered unclaimed RPL from a lot twice');
                });
            });
        });
    });
}
