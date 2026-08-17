import assert from "assert";
import { parseUnits } from "ethers";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import type { ProtocolCurrent, ProtocolV131, ProtocolV14 } from "../../harness";

const GAS_PRICE = parseUnits("20", "gwei");
const CALC_BASE = 10n ** 18n;

type MinipoolProtocol = ProtocolV131 | ProtocolV14 | ProtocolCurrent;

export async function skimRewardsAndAssert(
    protocol: MinipoolProtocol,
    name: string,
    options: { caller: string },
): Promise<void> {
    const entity = protocol.minipools.get(name);
    const withdrawalAddress = await protocol.nodes.withdrawalAddress(entity.node);
    const snapshot = async () => {
        const details = await protocol.minipools.details(name);
        return {
            details,
            withdrawal: await ethers.provider.getBalance(withdrawalAddress),
            reth: await ethers.provider.getBalance(await protocol.contracts.rocketTokenRETH.getAddress()),
        };
    };
    const before = await snapshot();
    const rewards = before.details.balance - before.details.nodeRefundBalance;
    assert(rewards < 8n * 10n ** 18n, "Cannot skim a balance of 8 ETH or more");
    const nodeCapitalShare = rewards * before.details.nodeDepositBalance
        / (before.details.nodeDepositBalance + before.details.userDepositBalance);
    const userCapitalShare = rewards - nodeCapitalShare;
    const expectedNode = nodeCapitalShare + userCapitalShare * before.details.nodeFee / CALC_BASE;
    const expectedUser = rewards - expectedNode;

    const receipt = await protocol.minipools.distributeBalance(name, {
        caller: options.caller,
        rewardsOnly: true,
        gasPrice: GAS_PRICE,
    });
    const after = await snapshot();
    const callerAddress = await protocol.nodes.address(options.caller);
    const gas = callerAddress.toLowerCase() === withdrawalAddress.toLowerCase()
        ? receipt.gasUsed * GAS_PRICE
        : 0n;
    const actualNode = BigInt(after.withdrawal) - BigInt(before.withdrawal)
        + after.details.nodeRefundBalance - before.details.nodeRefundBalance
        + gas;

    assert.equal(BigInt(after.reth) - BigInt(before.reth), expectedUser, "Incorrect user skimmed rewards");
    assert.equal(actualNode, expectedNode, "Incorrect node skimmed rewards");
    assert.equal(after.details.balance - after.details.nodeRefundBalance, 0n, "Skimmed rewards remained distributable");
}
