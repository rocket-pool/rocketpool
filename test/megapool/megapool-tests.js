import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import {
    getMinipoolMinimumRPLStake,
} from '../_helpers/minipool';
import {
    nodeStakeRPL,
    registerNode,
    setNodeWithdrawalAddress,
} from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { globalSnapShot } from '../_utils/snapshotting';
import * as assert from 'assert';
import { userDeposit } from '../_helpers/deposit';
import { RocketMegapoolFactory, RocketNodeDeposit } from '../_utils/artifacts';
import { getDepositDataRoot, getValidatorPubkey, getValidatorSignature } from '../_utils/beacon';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe.only('Megapools', () => {
        let owner,
            node,
            nodeWithdrawalAddress,
            random;

        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                nodeWithdrawalAddress,
                random,
            ] = await ethers.getSigners();

            // Register node & set withdrawal address
            await registerNode({ from: node });
            await setNodeWithdrawalAddress(node, nodeWithdrawalAddress, { from: node });

            // Stake RPL to cover megapool
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            let rplStake = minipoolRplStake * 7n;
            await mintRPL(owner, node, rplStake);
            await nodeStakeRPL(rplStake, { from: node });

            // Deposit ETH into deposit pool
            await userDeposit({ from: random, value: '24'.ether });
        });

        //
        // General
        //

        it(printTitle('node', 'can create a new validator'), async () => {
            const rocketNodeDeposit = await RocketNodeDeposit.deployed();
            const rocketMegapoolFactory = await RocketMegapoolFactory.deployed();

            const megapoolAddress = await rocketMegapoolFactory.getExpectedAddress(node.address);

            let withdrawalCredentials = '0x010000000000000000000000' + megapoolAddress.substr(2);

            // Get validator deposit data
            let depositData = {
                pubkey: getValidatorPubkey(),
                withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
                amount: BigInt(1000000000), // gwei
                signature: getValidatorSignature(),
            };

            let depositDataRoot = getDepositDataRoot(depositData);

            const tx = await rocketNodeDeposit.connect(node).deposit('8'.ether, false, depositData.pubkey, depositData.signature, depositDataRoot, {value: '8'.ether});
            const receipt = await tx.wait();
        });
    });
}
