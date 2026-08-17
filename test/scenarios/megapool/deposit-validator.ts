import assert from "assert";
import { parseEther } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import { RocketMegapoolDelegate__factory as CurrentMegapoolDelegateFactory } from "../../harness/bindings/current";
import { RocketMegapoolDelegate__factory as V14MegapoolDelegateFactory } from "../../harness/bindings/v1_4";
import type { ProtocolCurrent, ProtocolV14 } from "../../harness";

export async function depositMegapoolValidatorScenario(
    protocol: ProtocolV14 | ProtocolCurrent,
    node: string,
    options: {
        bond?: bigint;
        credit?: bigint;
        express?: boolean;
        expectedStatus?: "queue" | "prestake";
    } = {},
): Promise<void> {
    const bond = options.bond ?? parseEther("4");
    const credit = options.credit ?? 0n;
    const address = await protocol.megapools.address(node);
    const nodeAddress = await protocol.nodes.address(node);
    const megapool = protocol.release === "current"
        ? CurrentMegapoolDelegateFactory.connect(address, ethers.provider)
        : V14MegapoolDelegateFactory.connect(address, ethers.provider);
    const deployedBefore = await protocol.contracts.rocketMegapoolFactory.getMegapoolDeployed(nodeAddress);
    const validatorCountBefore = deployedBefore ? await megapool.getValidatorCount() : 0n;
    const [globalBefore, bondedBefore, borrowedBefore, creditBefore] = await Promise.all([
        protocol.contracts.rocketMegapoolManager.getValidatorCount(),
        protocol.contracts.rocketNodeStaking.getNodeETHBonded(nodeAddress),
        protocol.contracts.rocketNodeStaking.getNodeETHBorrowed(nodeAddress),
        protocol.contracts.rocketNodeDeposit.getNodeDepositCredit(nodeAddress),
    ]);

    await protocol.megapools.deposit(node, options);

    const [validatorCountAfter, globalAfter, bondedAfter, borrowedAfter, creditAfter] = await Promise.all([
        megapool.getValidatorCount(),
        protocol.contracts.rocketMegapoolManager.getValidatorCount(),
        protocol.contracts.rocketNodeStaking.getNodeETHBonded(nodeAddress),
        protocol.contracts.rocketNodeStaking.getNodeETHBorrowed(nodeAddress),
        protocol.contracts.rocketNodeDeposit.getNodeDepositCredit(nodeAddress),
    ]);
    assert.equal(validatorCountAfter - validatorCountBefore, 1n, "Megapool validator count did not increase");
    assert.equal(globalAfter - globalBefore, 1n, "Global validator count did not increase");
    assert.equal(bondedAfter - bondedBefore, bond, "Node bonded ETH delta was incorrect");
    assert.equal(borrowedAfter - borrowedBefore, parseEther("32") - bond, "Node borrowed ETH delta was incorrect");
    assert.equal(creditBefore - creditAfter, credit, "Deposit credit consumption was incorrect");

    const [nodeBond, queuedBond, userCapital, queuedUserCapital] = await Promise.all([
        megapool.getNodeBond(),
        megapool.getNodeQueuedBond(),
        megapool.getUserCapital(),
        megapool.getUserQueuedCapital(),
    ]);
    assert.equal(
        nodeBond + queuedBond,
        await protocol.contracts.rocketNodeStaking.getNodeMegapoolETHBonded(nodeAddress),
        "Megapool node capital did not match staking accounting",
    );
    assert.equal(
        userCapital + queuedUserCapital,
        await protocol.contracts.rocketNodeStaking.getNodeMegapoolETHBorrowed(nodeAddress),
        "Megapool user capital did not match staking accounting",
    );

    const [info] = await megapool.getValidatorInfoAndPubkey(validatorCountBefore);
    assert.equal(info.staked, false);
    assert.equal(info.exited, false);
    assert.equal(info.dissolved, false);
    assert.equal(info.expressUsed, options.express ?? false);
    if (options.expectedStatus === "queue") {
        assert.equal(info.inQueue, true);
        assert.equal(info.inPrestake, false);
    } else if (options.expectedStatus === "prestake") {
        assert.equal(info.inQueue, false);
        assert.equal(info.inPrestake, true);
    }
}
