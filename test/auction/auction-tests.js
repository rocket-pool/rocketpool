import { increaseTime, mineBlocks } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import {
    RocketDAONodeTrustedSettingsMinipool,
    RocketDAOProtocolSettingsAuction,
    RocketNodeStaking
} from '../_utils/artifacts';
import { auctionCreateLot, auctionPlaceBid, getLotStartBlock, getLotPriceAtBlock } from '../_helpers/auction';
import { userDeposit } from '../_helpers/deposit';
import { createMinipool, stakeMinipool } from '../_helpers/minipool';
import { submitPrices } from '../_helpers/network';
import { registerNode, setNodeTrusted, nodeStakeRPL } from '../_helpers/node';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { mintRPL } from '../_helpers/tokens';
import { createLot } from './scenario-create-lot';
import { placeBid } from './scenario-place-bid';
import { claimBid } from './scenario-claim-bid';
import { recoverUnclaimedRPL } from './scenario-recover-rpl';
import { withdrawValidatorBalance } from '../minipool/scenario-withdraw-validator-balance'
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { upgradeOneDotTwo } from '../_utils/upgrade';
import { assertBN } from '../_helpers/bn';

export default function() {
    contract('RocketAuctionManager', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode,
            random1,
            random2,
        ] = accounts;


        // Setup
        let scrubPeriod = (60 * 60 * 24); // 24 hours
        let minipool;
        before(async () => {
            await upgradeOneDotTwo(owner);

            // Set settings
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});

            // Register node
            await registerNode({from: node});

            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);

            // Mint RPL to node & stake; create & stake minipool
            const rplAmount = '10000'.ether;
            await mintRPL(owner, node, rplAmount);
            await nodeStakeRPL(rplAmount, {from: node});
            minipool = await createMinipool({from: node, value: '8'.ether});
            await userDeposit({from: random1, value: '24'.ether});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(minipool, {from: node});

            // Send 8 ETH to the minipool so a slash will occur on distribute
            await web3.eth.sendTransaction({
                from: owner,
                to: minipool.address,
                value: '8'.ether,
            });
        });


        it(printTitle('random address', 'can create a lot'), async () => {
            // Slash RPL assigned to minipool to fill auction contract
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);

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
            // Slash RPL assigned to minipool to fill auction contract
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);

            // Disable lot creation
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.create.enabled', false, {from: owner});

            // Attempt to create lot
            await shouldRevert(createLot({
                from: random1,
            }), 'Created a lot while lot creation was disabled');
        });

        
        it(printTitle('random address', 'cannot create a lot with an insufficient RPL balance'), async () => {
            // Attempt to create lot
            await shouldRevert(createLot({
                from: random1,
            }), 'Created a lot with an insufficient RPL balance');
        });


        it(printTitle('auction lot', 'has correct price at block'), async () => {
            // Set lot settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.duration', 100, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.price.start', '1'.ether, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.price.reserve', '0'.ether, {from: owner});

            // Set RPL price
            let block = await web3.eth.getBlockNumber();
            await submitPrices(block, '1'.ether, {from: trustedNode});

            // Create lot
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});

            // Get lot start block
            const startBlock = parseInt(await getLotStartBlock(0));

            // Set expected prices at blocks
            const values = [
                {block: startBlock +   0, expectedPrice: '1.0000'.ether},
                {block: startBlock +  12, expectedPrice: '0.9856'.ether},
                {block: startBlock +  25, expectedPrice: '0.9375'.ether},
                {block: startBlock +  37, expectedPrice: '0.8631'.ether},
                {block: startBlock +  50, expectedPrice: '0.7500'.ether},
                {block: startBlock +  63, expectedPrice: '0.6031'.ether},
                {block: startBlock +  75, expectedPrice: '0.4375'.ether},
                {block: startBlock +  88, expectedPrice: '0.2256'.ether},
                {block: startBlock + 100, expectedPrice: '0.0000'.ether},
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
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});
            await auctionCreateLot({from: random1});

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


        it(printTitle('random address', 'cannot bid on a lot which doesn\'t exist'), async () => {

            // Create lot
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});

            // Attempt to place bid
            await shouldRevert(placeBid(1, {
                from: random1,
                value: '4'.ether,
            }), 'Bid on a lot which doesn\'t exist');

        });


        it(printTitle('random address', 'cannot bid on a lot while bidding is disabled'), async () => {

            // Create lot
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});

            // Disable bidding
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.bidding.enabled', false, {from: owner});

            // Attempt to place bid
            await shouldRevert(placeBid(0, {
                from: random1,
                value: '4'.ether,
            }), 'Bid on a lot while bidding was disabled');

        });


        it(printTitle('random address', 'cannot bid an invalid amount on a lot'), async () => {

            // Create lot
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});

            // Attempt to place bid
            await shouldRevert(placeBid(0, {
                from: random1,
                value: '0'.ether,
            }), 'Bid an invalid amount on a lot');

        });


        it(printTitle('random address', 'cannot bid on a lot after the lot bidding period has concluded'), async () => {

            // Set lot duration
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.duration', 0, {from: owner});

            // Create lot
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});

            // Attempt to place bid
            await shouldRevert(placeBid(0, {
                from: random1,
                value: '4'.ether,
            }), 'Bid on a lot after the bidding period concluded');

        });


        it(printTitle('random address', 'cannot bid on a lot after the RPL allocation has been exhausted'), async () => {

            // Create lot
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});

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


        it(printTitle('random address', 'can claim RPL from a lot'), async () => {

            // Create lots & place bids to clear
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});
            await auctionCreateLot({from: random1});
            await auctionPlaceBid(0, {from: random1, value: '5'.ether});
            await auctionPlaceBid(0, {from: random2, value: '5'.ether});
            await auctionPlaceBid(1, {from: random1, value: '3'.ether});
            await auctionPlaceBid(1, {from: random2, value: '3'.ether});

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


        it(printTitle('random address', 'cannot claim RPL from a lot which doesn\'t exist'), async () => {

            // Create lot & place bid to clear
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});
            await auctionPlaceBid(0, {from: random1, value: '1000'.ether});

            // Attempt to claim RPL
            await shouldRevert(claimBid(1, {
                from: random1, 
            }), 'Claimed RPL from a lot which doesn\'t exist');

        });


        it(printTitle('random address', 'cannot claim RPL from a lot before it has cleared'), async () => {

            // Create lot & place bid
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});
            await auctionPlaceBid(0, {from: random1, value: '4'.ether});

            // Attempt to claim RPL
            await shouldRevert(claimBid(0, {
                from: random1, 
            }), 'Claimed RPL from a lot before it has cleared');

        });


        it(printTitle('random address', 'cannot claim RPL from a lot it has not bid on'), async () => {

            // Create lot & place bid to clear
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});
            await auctionPlaceBid(0, {from: random1, value: '1000'.ether});

            // Attempt to claim RPL
            await shouldRevert(claimBid(0, {
                from: random2, 
            }), 'Address claimed RPL from a lot it has not bid on');

        });


        it(printTitle('random address', 'can recover unclaimed RPL from a lot'), async () => {

            // Create closed lots
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.duration', 0, {from: owner});
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});
            await auctionCreateLot({from: random1});

            // Recover RPL from first lot
            await recoverUnclaimedRPL(0, {
                from: random1,
            });

            // Recover RPL from second lot
            await recoverUnclaimedRPL(1, {
                from: random1,
            });

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot which doesn\'t exist'), async () => {

            // Create closed lot
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.duration', 0, {from: owner});
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});

            // Attempt to recover RPL
            await shouldRevert(recoverUnclaimedRPL(1, {
                from: random1,
            }), 'Recovered unclaimed RPL from a lot which doesn\'t exist');

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot before the lot bidding period has concluded'), async () => {

            // Create lot
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});

            // Attempt to recover RPL
            await shouldRevert(recoverUnclaimedRPL(0, {
                from: random1,
            }), 'Recovered unclaimed RPL from a lot before its bidding period had concluded');

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot twice'), async () => {

            // Create closed lot
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.duration', 0, {from: owner});
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});

            // Recover RPL
            await recoverUnclaimedRPL(0, {from: random1});

            // Attempt to recover RPL again
            await shouldRevert(recoverUnclaimedRPL(0, {
                from: random1,
            }), 'Recovered unclaimed RPL from a lot twice');

        });


        it(printTitle('random address', 'cannot recover unclaimed RPL from a lot which has no RPL to recover'), async () => {

            // Set lot duration
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsAuction, 'auction.lot.duration', 10, {from: owner});

            // Create lot & place bid to clear
            await withdrawValidatorBalance(minipool, '0'.ether, node, true);
            await auctionCreateLot({from: random1});
            await auctionPlaceBid(0, {from: random1, value: '1000'.ether});

            // Move to lot bidding period end
            await mineBlocks(web3, 10);

            // Attempt to recover RPL again
            await shouldRevert(recoverUnclaimedRPL(0, {
                from: random1,
            }), 'Recovered unclaimed RPL from a lot which had no RPL to recover');

        });
        
    });
}
