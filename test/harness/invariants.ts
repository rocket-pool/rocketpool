import {
    RocketMegapoolDelegate__factory as V14MegapoolDelegateFactory,
    RocketMegapoolFactory__factory as V14MegapoolFactoryFactory,
} from "./bindings/v1_4";
import type { ProtocolContext } from "./context";
import { getActiveAddress } from "./deployment";
import {
    connectCurrent,
    connectV131,
    connectV14,
} from "./protocol/connections";
import { connectMinipoolDelegate } from "./protocol/minipool-delegates";
import { ethers } from "../../test-old/_utils/hardhat-runtime";

const STAKING_STATUS = 2n;
const ETHER = 10n ** 18n;
const MINIPOOL_BOND_SIZES = [8n * ETHER, 16n * ETHER] as const;

interface NodeManagerReader {
    getNodeCount(): Promise<bigint>;
    getNodeAddresses(offset: bigint, limit: bigint): Promise<string[]>;
    getAverageNodeFee(nodeAddress: string): Promise<bigint>;
}

interface MinipoolManagerReader {
    getNodeMinipoolCount(nodeAddress: string): Promise<bigint>;
    getNodeMinipoolAt(nodeAddress: string, index: bigint): Promise<string>;
    getNodeActiveMinipoolCount(nodeAddress: string): Promise<bigint>;
    getNodeFinalisedMinipoolCount(nodeAddress: string): Promise<bigint>;
    getNodeStakingMinipoolCount(nodeAddress: string): Promise<bigint>;
    getNodeStakingMinipoolCountBySize(
        nodeAddress: string,
        bond: bigint,
    ): Promise<bigint>;
}

interface NodeStakingReader {
    getNodeMegapoolETHBorrowed(nodeAddress: string): Promise<bigint>;
    getNodeMegapoolETHBonded(nodeAddress: string): Promise<bigint>;
}

interface DepositPoolReader {
    getNodeBalance(): Promise<bigint>;
}

interface InvariantContracts {
    nodeManager: NodeManagerReader;
    minipoolManager: MinipoolManagerReader;
    nodeStaking: NodeStakingReader | null;
    depositPool: DepositPoolReader;
}

interface MinipoolState {
    address: string;
    status: bigint;
    finalised: boolean;
    nodeFee: bigint;
    userDepositBalance: bigint;
    nodeDepositBalance: bigint;
}

function fail(
    context: ProtocolContext,
    description: string,
    expected: bigint | number,
    actual: bigint | number,
): never {
    throw new Error(
        `Protocol invariant failed [${context.release ?? "uninitialised"}]: `
        + `${description}; expected ${expected.toString()}, got ${actual.toString()}`,
    );
}

function equal(
    context: ProtocolContext,
    description: string,
    expected: bigint | number,
    actual: bigint | number,
): void {
    if (BigInt(expected) !== BigInt(actual)) {
        fail(context, description, expected, actual);
    }
}

function activeContracts(context: ProtocolContext): InvariantContracts {
    const view = (() => {
        switch (context.release) {
            case "1.3.1":
                return connectV131(context);
            case "1.4":
                return connectV14(context);
            case "current":
                return connectCurrent(context);
            default:
                throw new Error("Cannot check protocol invariants before a release is active");
        }
    })();
    const contracts = view.contracts;

    return {
        nodeManager: contracts.rocketNodeManager as unknown as NodeManagerReader,
        minipoolManager: contracts.rocketMinipoolManager as unknown as MinipoolManagerReader,
        nodeStaking: context.release === "1.3.1"
            ? null
            : contracts.rocketNodeStaking as unknown as NodeStakingReader,
        depositPool: contracts.rocketDepositPool as unknown as DepositPoolReader,
    };
}

async function getNodeAddresses(nodeManager: NodeManagerReader): Promise<string[]> {
    const count = await nodeManager.getNodeCount();
    if (count === 0n) return [];
    return nodeManager.getNodeAddresses(0n, count);
}

async function getMinipools(
    context: ProtocolContext,
    manager: MinipoolManagerReader,
    nodeAddress: string,
): Promise<MinipoolState[]> {
    const count = await manager.getNodeMinipoolCount(nodeAddress);
    return Promise.all(Array.from({ length: Number(count) }, async (_, index) => {
        const address = await manager.getNodeMinipoolAt(nodeAddress, BigInt(index));
        try {
            const minipool = await connectMinipoolDelegate(address, ethers.provider);
            const [
                status,
                finalised,
                nodeFee,
                userDepositBalance,
                nodeDepositBalance,
            ] = await Promise.all([
                minipool.getStatus(),
                minipool.getFinalised(),
                minipool.getNodeFee(),
                minipool.getUserDepositBalance(),
                minipool.getNodeDepositBalance(),
            ]);
            return {
                address,
                status,
                finalised,
                nodeFee,
                userDepositBalance,
                nodeDepositBalance,
            };
        } catch (error) {
            throw new Error(
                `Protocol invariant failed [${context.release}]: unable to inspect minipool `
                + `${address} for node ${nodeAddress}`,
                { cause: error },
            );
        }
    }));
}

function weightedAverage(
    context: ProtocolContext,
    nodeAddress: string,
    minipools: MinipoolState[],
): bigint {
    if (minipools.length === 0) return 0n;

    const numerator = minipools.reduce(
        (total, minipool) => total + minipool.nodeFee * minipool.userDepositBalance,
        0n,
    );
    const denominator = minipools.reduce(
        (total, minipool) => total + minipool.userDepositBalance,
        0n,
    );
    if (denominator === 0n) {
        throw new Error(
            `Protocol invariant failed [${context.release}]: staking minipools for node `
            + `${nodeAddress} have zero total user deposit balance `
            + `(${minipools.map(minipool => minipool.address).join(", ")})`,
        );
    }
    return numerator / denominator;
}

async function checkNodeMinipoolInvariants(
    context: ProtocolContext,
    contracts: InvariantContracts,
    nodeAddress: string,
): Promise<void> {
    const minipools = await getMinipools(
        context,
        contracts.minipoolManager,
        nodeAddress,
    );
    const staking = minipools.filter(
        minipool => minipool.status === STAKING_STATUS && !minipool.finalised,
    );

    const [
        recordedActive,
        recordedFinalised,
        recordedStaking,
        recordedAverageFee,
    ] = await Promise.all([
        contracts.minipoolManager.getNodeActiveMinipoolCount(nodeAddress),
        contracts.minipoolManager.getNodeFinalisedMinipoolCount(nodeAddress),
        contracts.minipoolManager.getNodeStakingMinipoolCount(nodeAddress),
        contracts.nodeManager.getAverageNodeFee(nodeAddress),
    ]);

    equal(
        context,
        `active minipool count for node ${nodeAddress}`,
        minipools.filter(minipool => !minipool.finalised).length,
        recordedActive,
    );
    equal(
        context,
        `finalised minipool count for node ${nodeAddress}`,
        minipools.filter(minipool => minipool.finalised).length,
        recordedFinalised,
    );
    equal(
        context,
        `staking minipool count for node ${nodeAddress}`,
        staking.length,
        recordedStaking,
    );

    const recordedBySize = await Promise.all(MINIPOOL_BOND_SIZES.map(
        bond => contracts.minipoolManager.getNodeStakingMinipoolCountBySize(
            nodeAddress,
            bond,
        ),
    ));
    for (const [index, bond] of MINIPOOL_BOND_SIZES.entries()) {
        equal(
            context,
            `staking ${bond / ETHER} ETH minipool count for node ${nodeAddress}`,
            staking.filter(minipool => minipool.nodeDepositBalance === bond).length,
            recordedBySize[index],
        );
    }

    equal(
        context,
        `average node fee for node ${nodeAddress}`,
        weightedAverage(context, nodeAddress, staking),
        recordedAverageFee,
    );
}

async function checkMegapoolInvariants(
    context: ProtocolContext,
    contracts: InvariantContracts,
    nodeAddresses: string[],
): Promise<void> {
    if (context.release === "1.3.1") return;
    if (!contracts.nodeStaking) {
        throw new Error(`Megapool invariant bindings are unavailable for ${context.release}`);
    }

    const factory = V14MegapoolFactoryFactory.connect(
        getActiveAddress(context.deployment, "rocketMegapoolFactory"),
        ethers.provider,
    );
    let totalQueuedBond = 0n;

    for (const nodeAddress of nodeAddresses) {
        if (!await factory.getMegapoolDeployed(nodeAddress)) continue;

        const address = await factory.getExpectedAddress(nodeAddress);
        const megapool = V14MegapoolDelegateFactory.connect(address, ethers.provider);
        const [
            nodeQueuedBond,
            nodeBond,
            userCapital,
            userQueuedCapital,
            recordedBorrowed,
            recordedBonded,
        ] = await Promise.all([
            megapool.getNodeQueuedBond(),
            megapool.getNodeBond(),
            megapool.getUserCapital(),
            megapool.getUserQueuedCapital(),
            contracts.nodeStaking.getNodeMegapoolETHBorrowed(nodeAddress),
            contracts.nodeStaking.getNodeMegapoolETHBonded(nodeAddress),
        ]);

        totalQueuedBond += nodeQueuedBond;
        equal(
            context,
            `megapool ETH borrowed for node ${nodeAddress} (${address})`,
            userCapital + userQueuedCapital,
            recordedBorrowed,
        );
        equal(
            context,
            `megapool ETH bonded for node ${nodeAddress} (${address})`,
            nodeBond + nodeQueuedBond,
            recordedBonded,
        );
    }

    equal(
        context,
        "deposit pool node balance",
        totalQueuedBond,
        await contracts.depositPool.getNodeBalance(),
    );
}

export async function checkProtocolInvariants(context: ProtocolContext): Promise<void> {
    const contracts = activeContracts(context);
    const nodeAddresses = await getNodeAddresses(contracts.nodeManager);

    await Promise.all(nodeAddresses.map(
        nodeAddress => checkNodeMinipoolInvariants(context, contracts, nodeAddress),
    ));
    await checkMegapoolInvariants(context, contracts, nodeAddresses);
}
