import assert from "assert";
import { parseEther } from "ethers";

import type { MinipoolEntity, ProtocolV131 } from "../../harness";

const LAUNCH_BALANCE = parseEther("32");
const PRELAUNCH_STATUS = 1;

export async function createVacantMinipoolScenario(
    protocol: ProtocolV131,
    name: string,
    options: {
        node: string;
        bond: bigint;
        currentBalance?: bigint;
        pubkey?: string;
        salt?: bigint;
    },
): Promise<MinipoolEntity> {
    const borrowedBefore = await protocol.nodes.borrowedEth(options.node);
    const entity = await protocol.minipools.createVacant(name, options);
    const [borrowedAfter, details, reverseAddress] = await Promise.all([
        protocol.nodes.borrowedEth(options.node),
        protocol.minipools.details(name),
        protocol.minipools.addressForPubkey(entity.pubkey),
    ]);

    const currentBalance = options.currentBalance ?? LAUNCH_BALANCE;
    assert.equal(
        borrowedAfter - borrowedBefore,
        LAUNCH_BALANCE - options.bond,
        "Incorrect node borrowed ETH change",
    );
    assert.equal(details.status, PRELAUNCH_STATUS, "Incorrect vacant minipool status");
    assert.equal(details.vacant, true, "Minipool was not marked vacant");
    assert.equal(details.nodeDepositBalance, options.bond, "Incorrect node deposit balance");
    assert.equal(
        details.userDepositBalance,
        LAUNCH_BALANCE - options.bond,
        "Incorrect user deposit balance",
    );
    assert.equal(
        details.nodeRefundBalance,
        currentBalance - LAUNCH_BALANCE,
        "Incorrect initial node refund balance",
    );
    assert.equal(reverseAddress, entity.address, "Vacant minipool pubkey mapping was not set");
    return entity;
}
