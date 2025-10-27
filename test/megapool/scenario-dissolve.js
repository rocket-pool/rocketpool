import { getMegapoolForNode } from '../_helpers/megapool';
import {
    RocketDAOProtocolSettingsMegapool,
    RocketDAOProtocolSettingsNode,
    RocketMegapoolManager,
    RocketNodeStaking,
} from '../_utils/artifacts';
import { assertBN } from '../_helpers/bn';
import { getSlotForBlock } from '../_helpers/beaconchain';

const hre = require('hardhat');
const ethers = hre.ethers;
const helpers = require('@nomicfoundation/hardhat-network-helpers');

export async function dissolveValidator(node, validatorIndex, from = node, proof = null) {
    const megapool = await getMegapoolForNode(node)

    const [
        rocketNodeStaking,
        rocketDAOProtocolSettingsMegapool,
    ] = await Promise.all([
        RocketNodeStaking.deployed(),
        RocketDAOProtocolSettingsMegapool.deployed()
    ]);

    const nodeAddress = await megapool.getNodeAddress();
    const dissolvePenalty = await rocketDAOProtocolSettingsMegapool.getDissolvePenalty();

    async function getData() {
        return await Promise.all([
            rocketNodeStaking.getNodeETHBorrowed(nodeAddress),
            rocketNodeStaking.getNodeETHBonded(nodeAddress),
            rocketNodeStaking.getNodeMegapoolETHBorrowed(nodeAddress),
            rocketNodeStaking.getNodeMegapoolETHBonded(nodeAddress),
            megapool.getNodeBond(),
            megapool.getUserCapital(),
            megapool.getDebt(),
        ]).then(
            ([nodeEthBorrowed, nodeEthBonded, nodeMegapoolEthBorrowed, nodeMegapoolEthBonded, nodeBond, userCapital, debt]) =>
                ({ nodeEthBorrowed, nodeEthBonded, nodeMegapoolEthBorrowed, nodeMegapoolEthBonded, nodeBond, userCapital, debt }),
        );
    }

    // Calculate new bond requirement
    const activeValidatorCount = await megapool.getActiveValidatorCount();
    let bondRequirement = 0n;
    if (activeValidatorCount > 1n) {
        bondRequirement = await rocketNodeDeposit.getBondRequirement(activeValidatorCount - 1n);
    }
    const nodeBond = await megapool.getNodeBond();

    // Calculate expected change in bond and capital
    let expectedNodeBondChange = bondRequirement - nodeBond;
    if (expectedNodeBondChange < -'32'.ether) {
        expectedNodeBondChange = -'32'.ether
    }
    const expectedUserCapitalChange = -'32'.ether - expectedNodeBondChange;

    const data1 = await getData();
    if (proof === null) {
        await megapool.connect(from).dissolveValidator(validatorIndex);
    } else {
        // Use current time as slot timestamp
        await helpers.mine();
        const latestBlock = await ethers.provider.getBlock('latest');
        const currentTime = latestBlock.timestamp;

        const slotProof = {
            slot: await getSlotForBlock(),
            witnesses: [],
        }

        const rocketMegapoolManager = await RocketMegapoolManager.deployed();
        await rocketMegapoolManager.connect(from).dissolve(megapool.target, validatorIndex, currentTime, proof, slotProof)
    }
    const data2 = await getData();

    const deltas = {
        nodeEthBonded: data2.nodeEthBonded - data1.nodeEthBonded,
        nodeEthBorrowed: data2.nodeEthBorrowed - data1.nodeEthBorrowed,
        nodeMegapoolEthBonded: data2.nodeMegapoolEthBonded - data1.nodeMegapoolEthBonded,
        nodeMegapoolEthBorrowed:data2.nodeMegapoolEthBorrowed - data1.nodeMegapoolEthBorrowed,
        nodeBond:data2.nodeBond - data1.nodeBond,
        userCapital: data2.userCapital - data1.userCapital,
        debt: data2.debt - data1.debt,
    }

    assertBN.equal(deltas.nodeEthBonded, expectedNodeBondChange);
    assertBN.equal(deltas.nodeEthBorrowed, expectedUserCapitalChange);
    assertBN.equal(deltas.nodeMegapoolEthBonded, expectedNodeBondChange);
    assertBN.equal(deltas.nodeMegapoolEthBorrowed, expectedUserCapitalChange);
    assertBN.equal(deltas.nodeBond, expectedNodeBondChange);
    assertBN.equal(deltas.userCapital, expectedUserCapitalChange);
    assertBN.equal(data2.userCapital, data2.nodeMegapoolEthBorrowed);
    assertBN.equal(data2.nodeBond, data2.nodeMegapoolEthBonded);
    assertBN.equal(deltas.nodeBond + deltas.userCapital, -'32'.ether);
    assertBN.equal(deltas.debt, dissolvePenalty);
}
