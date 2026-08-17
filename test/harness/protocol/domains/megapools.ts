import { Buffer } from "buffer";
import * as lodestarMainnet from "@chainsafe/lodestar-types/lib/ssz/presets/mainnet.js";

import { ethers } from "../../../../test-old/_utils/hardhat-runtime";
import { RocketMegapoolDelegate__factory as CurrentMegapoolDelegateFactory } from "../../bindings/current";
import { RocketMegapoolProxy__factory as CurrentMegapoolProxyFactory } from "../../bindings/current";
import { RocketMegapoolDelegate__factory as V14MegapoolDelegateFactory } from "../../bindings/v1_4";
import type { CurrentContracts, V14Contracts } from "../contracts";
import { GuardedFacade } from "../view";

const lodestarTypes = lodestarMainnet.types;

function signature(seed: string): string {
    const parts = [0, 1, 2].map(index =>
        ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(`${seed}:signature:${index}`))),
    );
    return ethers.hexlify(Buffer.concat(parts.map(part => Buffer.from(part))));
}

function pubkey(seed: string): string {
    const first = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(`${seed}:pubkey:0`)));
    const second = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(`${seed}:pubkey:1`)));
    return ethers.hexlify(Buffer.concat([Buffer.from(first), Buffer.from(second).subarray(0, 16)]));
}

function root(key: string, credentials: string, validatorSignature: string): string {
    return ethers.hexlify(lodestarTypes.DepositData.hashTreeRoot({
        pubkey: Buffer.from(key.slice(2), "hex"),
        withdrawalCredentials: Buffer.from(credentials.slice(2), "hex"),
        amount: 1_000_000_000n,
        signature: Buffer.from(validatorSignature.slice(2), "hex"),
    }));
}

type MegapoolContracts = V14Contracts | CurrentContracts;

export class MegapoolActions<C extends MegapoolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async address(node: string): Promise<string> {
        this.active();
        return this.contracts.rocketMegapoolFactory.getExpectedAddress(
            await this.view.context.actorAddress(node),
        );
    }

    async deploy(node: string): Promise<string> {
        this.active();
        const signer = await this.view.context.actor(node);
        await (await this.contracts.rocketNodeManager.connect(signer).deployMegapool()).wait();
        const address = await this.address(node);
        if (!await this.contracts.rocketMegapoolFactory.getMegapoolDeployed(await signer.getAddress())) {
            throw new Error(`Megapool was not deployed for ${node}`);
        }
        this.view.context.trace(`deployed megapool for ${node} at ${address}`);
        return address;
    }

    async deposit(
        node: string,
        options: { bond?: bigint; credit?: bigint; express?: boolean } = {},
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(node);
        const bond = options.bond ?? 4n * 10n ** 18n;
        const credit = options.credit ?? 0n;
        const express = options.express ?? false;
        const address = await this.address(node);
        const credentials = `0x010000000000000000000000${address.slice(2)}`;
        const index = await this.contracts.rocketMegapoolManager.getValidatorCount();
        const key = pubkey(`${this.view.context.scopeId}:${node}:megapool:${index}`);
        const validatorSignature = signature(`${this.view.context.scopeId}:${node}:megapool:${index}`);
        const dataRoot = root(key, credentials, validatorSignature);

        if (credit === 0n) {
            await (await this.contracts.rocketNodeDeposit.connect(signer).deposit(
                bond,
                express,
                key,
                validatorSignature,
                dataRoot,
                { value: bond },
            )).wait();
        } else {
            await (await this.contracts.rocketNodeDeposit.connect(signer).depositWithCredit(
                bond,
                express,
                key,
                validatorSignature,
                dataRoot,
                { value: bond - credit },
            )).wait();
        }
        this.view.context.trace(`deposited ${bond} wei megapool validator for ${node}`);
    }

    async depositMulti(
        node: string,
        deposits: Array<{ bond?: bigint; express?: boolean }>,
        options: { credit?: bigint; value?: bigint } = {},
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(node);
        const address = await this.address(node);
        const credentials = `0x010000000000000000000000${address.slice(2)}`;
        const start = await this.contracts.rocketMegapoolManager.getValidatorCount();
        const items = deposits.map((deposit, offset) => {
            const seed = `${this.view.context.scopeId}:${node}:megapool:${start + BigInt(offset)}`;
            const key = pubkey(seed);
            const validatorSignature = signature(seed);
            return {
                bondAmount: deposit.bond ?? 4n * 10n ** 18n,
                useExpressTicket: deposit.express ?? false,
                validatorPubkey: key,
                validatorSignature,
                depositDataRoot: root(key, credentials, validatorSignature),
            };
        });
        const totalBond = items.reduce((total, item) => total + item.bondAmount, 0n);
        const value = options.value ?? totalBond - (options.credit ?? 0n);
        await (await this.contracts.rocketNodeDeposit.connect(signer).depositMulti(items, { value })).wait();
        this.view.context.trace(`deposited ${items.length} megapool validators for ${node}`);
    }

    async fundCredit(node: string, funder: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(funder);
        await (await this.contracts.rocketNodeDeposit.connect(signer).depositEthFor(
            await this.view.context.actorAddress(node),
            { value: amount },
        )).wait();
    }

    async provisionExpressTickets(node: string, count: bigint): Promise<void> {
        this.active();
        const fixtureName = "megapool-express-ticket-storage";
        const fixture = this.view.context.hasFixture(fixtureName)
            ? this.view.context.fixtures.storage.get(fixtureName)
            : await this.view.context.fixtures.storage.deploy(fixtureName);
        const key = ethers.solidityPackedKeccak256(
            ["string", "address"],
            ["node.express.tickets", await this.view.context.actorAddress(node)],
        );
        await fixture.setUint(key, count);
    }

    async disableProofVerification(): Promise<void> {
        this.active();
        if (this.view.release !== "current") {
            throw new Error("The mock beacon verifier is only available in the current release");
        }
        const guardian = await this.view.context.guardian();
        await (await (this.contracts as CurrentContracts).beaconStateVerifier
            .connect(guardian).setDisabled(true)).wait();
        this.view.context.trace("disabled megapool beacon proof verification");
    }

    delegate(node: string, caller?: string) {
        this.active();
        const connect = async () => {
            const runner = caller
                ? await this.view.context.actor(caller)
                : ethers.provider;
            const address = await this.address(node);
            return this.view.release === "current"
                ? CurrentMegapoolDelegateFactory.connect(address, runner)
                : V14MegapoolDelegateFactory.connect(address, runner);
        };
        return connect();
    }

    async proxy(node: string, caller?: string) {
        this.active();
        if (this.view.release !== "current") {
            throw new Error("Typed megapool proxy bindings are only available in the current release");
        }
        const runner = caller ? await this.view.context.actor(caller) : ethers.provider;
        return CurrentMegapoolProxyFactory.connect(await this.address(node), runner);
    }

    async dequeue(node: string, index: bigint, caller = node): Promise<void> {
        await (await (await this.delegate(node, caller)).dequeue(index)).wait();
    }

    async distribute(node: string, caller = node): Promise<void> {
        await (await (await this.delegate(node, caller)).distribute()).wait();
    }

    async reduceBond(node: string, amount: bigint, caller = node): Promise<void> {
        await (await (await this.delegate(node, caller)).reduceBond(amount)).wait();
    }

    async repayDebt(node: string, amount: bigint, caller = node): Promise<void> {
        await (await (await this.delegate(node, caller)).repayDebt({ value: amount })).wait();
    }

    async sendRewards(node: string, funder: string, amount: bigint): Promise<void> {
        const signer = await this.view.context.actor(funder);
        await (await signer.sendTransaction({ to: await this.address(node), value: amount })).wait();
    }

    async queuePosition(node: string, validatorId: bigint): Promise<bigint | null> {
        this.active();
        const megapool = await this.delegate(node);
        const info = await megapool.getValidatorInfo(validatorId);
        const namespace = ethers.solidityPackedKeccak256(
            ["string"],
            [info.expressUsed ? "deposit.queue.express" : "deposit.queue.standard"],
        );
        const storage = this.contracts.linkedListStorage;
        const address = (await this.address(node)).toLowerCase();
        let scanIndex = 0n;
        let position = 0n;
        let localPosition: bigint | null = null;
        do {
            const [entries, nextIndex] = await storage.scan(namespace, scanIndex, 100n);
            for (const entry of entries) {
                if (entry.receiver.toLowerCase() === address && entry.validatorId === validatorId) {
                    localPosition = position;
                    break;
                }
                position += 1n;
            }
            if (localPosition !== null || nextIndex === 0n) break;
            scanIndex = nextIndex;
        } while (true);
        if (localPosition === null) return null;

        const expressNamespace = ethers.solidityPackedKeccak256(["string"], ["deposit.queue.express"]);
        const standardNamespace = ethers.solidityPackedKeccak256(["string"], ["deposit.queue.standard"]);
        const [expressLength, standardLength, queueIndex, expressRate] = await Promise.all([
            storage.getLength(expressNamespace),
            storage.getLength(standardNamespace),
            this.contracts.rocketDepositPool.getQueueIndex(),
            this.contracts.rocketDAOProtocolSettingsDeposit.getExpressQueueRate(),
        ]);
        const interval = expressRate + 1n;
        if (info.expressUsed) {
            let standardBefore = (localPosition + queueIndex % interval) / expressRate;
            if (standardBefore > standardLength) standardBefore = standardLength;
            return localPosition + standardBefore;
        }
        let expressBefore = localPosition * expressLength + (expressRate - queueIndex % interval);
        if (expressBefore > expressLength) expressBefore = expressLength;
        return localPosition + expressBefore;
    }

    async validator(node: string, index: bigint): Promise<{
        staked: boolean;
        inQueue: boolean;
        inPrestake: boolean;
    }> {
        this.active();
        const address = await this.address(node);
        const [info] = this.view.release === "current"
            ? await CurrentMegapoolDelegateFactory.connect(address, ethers.provider)
                .getValidatorInfoAndPubkey(index)
            : await V14MegapoolDelegateFactory.connect(address, ethers.provider)
                .getValidatorInfoAndPubkey(index);
        return { staked: info.staked, inQueue: info.inQueue, inPrestake: info.inPrestake };
    }
}
