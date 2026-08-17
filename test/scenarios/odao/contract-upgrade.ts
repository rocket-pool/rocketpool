import assert from "assert";
import { Buffer } from "buffer";
import pako from "pako";

import { ethers } from "../../../test-old/_utils/hardhat-runtime";
import {
    RocketDAONodeTrustedUpgrade__factory,
    RocketMinipoolManager__factory,
} from "../../harness/bindings/current";
import type { ProtocolCurrent } from "../../harness";

const PENDING = 0n;
const ACTIVE = 1n;
const SUCCEEDED = 4n;
const EXECUTED = 6n;

export function compressAbi(abi: readonly unknown[]): string {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString("base64");
}

export async function deployMinipoolManagerUpgradeTarget(
    protocol: ProtocolCurrent,
): Promise<string> {
    const replacement = await new RocketMinipoolManager__factory(
        await protocol.context.guardian(),
    ).deploy(protocol.context.deployment.rocketStorageAddress);
    await replacement.waitForDeployment();
    return replacement.getAddress();
}

export async function deployODAOUpgradeTarget(protocol: ProtocolCurrent): Promise<string> {
    const replacement = await new RocketDAONodeTrustedUpgrade__factory(
        await protocol.context.guardian(),
    ).deploy(protocol.context.deployment.rocketStorageAddress);
    await replacement.waitForDeployment();
    return replacement.getAddress();
}

export async function bootstrapRegistryChangeAndAssert(
    protocol: ProtocolCurrent,
    options: {
        type: "upgradeContract" | "addContract" | "upgradeABI" | "addABI";
        name: string;
        abi: readonly unknown[];
        address: string;
        caller?: string;
    },
): Promise<void> {
    const storage = protocol.contracts.rocketStorage;
    const addressKey = ethers.solidityPackedKeccak256(
        ["string", "string"],
        ["contract.address", options.name],
    );
    const abiKey = ethers.solidityPackedKeccak256(
        ["string", "string"],
        ["contract.abi", options.name],
    );
    const oldAddress = await storage.getFunction("getAddress")(addressKey);
    const compressedAbi = compressAbi(options.abi);

    await protocol.odao.bootstrap.upgrade(
        options.type,
        options.name,
        compressedAbi,
        options.address,
        { caller: options.caller },
    );

    if (options.type === "upgradeContract" || options.type === "addContract") {
        assert.equal(await storage.getFunction("getAddress")(addressKey), options.address);
        const existsKey = ethers.solidityPackedKeccak256(
            ["string", "address"],
            ["contract.exists", options.address],
        );
        assert.equal(await storage.getBool(existsKey), true);
        if (options.type === "upgradeContract") {
            const oldExistsKey = ethers.solidityPackedKeccak256(
                ["string", "address"],
                ["contract.exists", oldAddress],
            );
            assert.equal(await storage.getBool(oldExistsKey), false);
        }
    }
    assert.equal(await storage.getString(abiKey), compressedAbi);
}

export async function proposeContractUpgradeAndAssert(
    protocol: ProtocolCurrent,
    options: { proposer: string; contractName: string; message: string },
): Promise<bigint> {
    const replacement = await deployMinipoolManagerUpgradeTarget(protocol);
    const payload = protocol.contracts.rocketDAONodeTrustedProposals.interface.encodeFunctionData(
        "proposalUpgrade",
        [
            "upgradeContract",
            options.contractName,
            compressAbi(RocketMinipoolManager__factory.abi),
            replacement,
        ],
    );
    await protocol.time.advance(await protocol.odao.settings.proposals.getCooldown() + 1n);
    const totalBefore = await protocol.odao.proposals.total();
    const proposalId = await protocol.odao.proposals.propose(
        options.message,
        payload,
        { caller: options.proposer },
    );
    assert.equal(proposalId, totalBefore + 1n);
    const details = await protocol.odao.proposals.details(proposalId);
    assert.equal(details.state, PENDING);
    const now = await protocol.time.latest();
    if (now <= details.start) await protocol.time.advance(details.start - now + 1n);
    return proposalId;
}

export async function voteContractUpgradeAndAssert(
    protocol: ProtocolCurrent,
    proposalId: bigint,
    options: { caller: string },
): Promise<void> {
    await protocol.odao.proposals.vote(proposalId, true, options);
    const details = await protocol.odao.proposals.details(proposalId);
    if (details.state === ACTIVE) assert(details.votesFor < details.votesRequired);
    else if (details.state === SUCCEEDED) assert(details.votesFor >= details.votesRequired);
    else assert.fail(`Unexpected oDAO upgrade proposal state after vote: ${details.state}`);
}

export async function executeContractUpgradeProposalAndAssert(
    protocol: ProtocolCurrent,
    proposalId: bigint,
    options: { caller: string },
): Promise<bigint> {
    const totalBefore = await protocol.odao.upgrades.total();
    await protocol.odao.proposals.execute(proposalId, options);
    assert.equal((await protocol.odao.proposals.details(proposalId)).state, EXECUTED);
    const upgradeId = totalBefore + 1n;
    assert.equal(await protocol.odao.upgrades.total(), upgradeId);
    assert.equal(await protocol.odao.upgrades.state(upgradeId), PENDING);
    return upgradeId;
}
