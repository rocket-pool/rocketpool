import assert from "assert";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { MinipoolDetails, ProtocolCurrent, ProtocolV131, ProtocolV14 } from "../../harness";

const GAS_PRICE = 20n * 10n ** 9n;
const CALC_BASE = 10n ** 18n;

type WithdrawalProtocol = ProtocolV131 | ProtocolV14 | ProtocolCurrent;

interface DistributionOptions {
    balance: bigint;
    expectedUser: bigint;
    expectedNode: bigint;
    caller?: string;
    beginUserDistribution?: boolean;
    expectedFinalised?: boolean;
    expectedUserDistributed?: boolean;
}

function calculateNodeShare(
    details: MinipoolDetails,
    balance: bigint,
    penaltyRate: bigint,
): bigint {
    const userCapital = details.userDepositBalance;
    const nodeCapital = details.nodeDepositBalance;
    const capital = userCapital + nodeCapital;
    let nodeShare = 0n;

    if (balance > capital) {
        const rewards = balance - capital;
        const nodeRewards = rewards * nodeCapital / capital;
        const userRewards = rewards - nodeRewards;
        nodeShare = nodeCapital + nodeRewards + userRewards * details.nodeFee / CALC_BASE;
    } else if (balance > userCapital) {
        nodeShare = balance - userCapital;
    }

    return nodeShare - nodeShare * penaltyRate / CALC_BASE;
}

export async function distributeMinipoolBalanceAndAssert(
    protocol: WithdrawalProtocol,
    minipoolName: string,
    options: DistributionOptions,
): Promise<void> {
    const entity = protocol.minipools.get(minipoolName);
    const caller = options.caller ?? entity.node;
    await protocol.minipools.fund(minipoolName, caller, options.balance);
    if (options.beginUserDistribution) {
        await protocol.minipools.beginUserDistribute(minipoolName, { caller });
        await protocol.time.advanceMinipoolUserDistributeStart();
    }
    const nodeWithdrawalAddress = await protocol.nodes.withdrawalAddress(entity.node);

    const snapshot = async () => {
        const details = await protocol.minipools.details(minipoolName);
        return {
            reth: await ethers.provider.getBalance(await protocol.contracts.rocketTokenRETH.getAddress()),
            depositPool: await protocol.contracts.rocketDepositPool.getBalance(),
            node: await ethers.provider.getBalance(nodeWithdrawalAddress),
            refund: details.nodeRefundBalance,
            details,
        };
    };

    const before = await snapshot();
    const distributableBalance = before.refund > before.details.balance
        ? 0n
        : before.details.balance - before.refund;
    const penaltyRate = await protocol.minipools.penaltyRate(minipoolName);
    const calculatedNode = calculateNodeShare(before.details, distributableBalance, penaltyRate);
    const calculatedUser = distributableBalance - calculatedNode;
    assert.equal(
        calculatedUser,
        options.expectedUser,
        "Expected user share did not match the protocol withdrawal formula",
    );
    assert.equal(
        calculatedNode,
        options.expectedNode,
        "Expected node share did not match the protocol withdrawal formula",
    );
    const receipt = await protocol.minipools.distributeBalance(minipoolName, {
        caller,
        gasPrice: GAS_PRICE,
    });
    const after = await snapshot();
    const callerAddress = await protocol.nodes.address(caller);
    const gas = callerAddress.toLowerCase() === nodeWithdrawalAddress.toLowerCase()
        ? receipt.gasUsed * GAS_PRICE
        : 0n;
    const userDelta = BigInt(after.reth) - BigInt(before.reth) + after.depositPool - before.depositPool;
    const nodeDelta = BigInt(after.node) + gas - BigInt(before.node) + after.refund - before.refund;
    assert.equal(userDelta, options.expectedUser, "User withdrawal share was incorrect");
    assert.equal(nodeDelta, options.expectedNode, "Node withdrawal share was incorrect");
    if (options.expectedFinalised !== undefined) {
        assert.equal(
            after.details.finalised,
            options.expectedFinalised,
            "Minipool finalised state was incorrect",
        );
    }
    if (options.expectedUserDistributed !== undefined) {
        assert.equal(
            after.details.userDistributed,
            options.expectedUserDistributed,
            "Minipool user-distributed state was incorrect",
        );
    }
}
