import { Buffer } from "buffer";
import * as lodestarMainnet from "@chainsafe/lodestar-types/lib/ssz/presets/mainnet.js";
import type { ContractTransactionReceipt } from "ethers";

import { ethers } from "../../../../test-old/_utils/hardhat-runtime";
import {
    RocketMinipoolBase__factory as V131MinipoolBaseFactory,
} from "../../bindings/v1_3_1";
import type { Release } from "../../releases/catalog";
import type { ProtocolContracts, V131Contracts } from "../contracts";
import {
    connectMinipoolDelegate,
    getMinipoolDelegateVersion,
} from "../minipool-delegates";
import { GuardedFacade } from "../view";

const lodestarTypes = lodestarMainnet.types;

export interface MinipoolEntity {
    address: string;
    node: string;
    bond: bigint;
    createdRelease: Release;
    provenance: "lifecycle";
    pubkey: string;
    salt: bigint;
}

export interface NodeMinipoolDetails {
    address: string;
    status: number;
    nodeFee: bigint;
}

export interface MinipoolDetails extends NodeMinipoolDetails {
    pubkey: string;
    depositType: number;
    nodeDepositBalance: bigint;
    nodeRefundBalance: bigint;
    userDepositBalance: bigint;
    balance: bigint;
    scrubVotes: bigint;
    vacant: boolean;
    finalised: boolean;
    userDistributed: boolean;
}

export interface MinipoolDelegateInfo {
    version: number;
    storedAddress: string;
    previousAddress: string;
    effectiveAddress: string;
    useLatest: boolean;
}

export interface MinipoolBondReductionInfo {
    time: bigint;
    value: bigint;
    cancelled: boolean;
}

export interface StakeMinipoolOptions {
    caller?: string;
    validatorPubkey?: string;
    withdrawalCredentials?: string;
}

function signature(seed: string): string {
    const parts = [0, 1, 2].map(index =>
        ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(`${seed}:signature:${index}`))),
    );
    return ethers.hexlify(Buffer.concat(parts.map(part => Buffer.from(part))));
}

function validatorPubkey(seed: string): string {
    const first = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(`${seed}:pubkey:0`)));
    const second = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(`${seed}:pubkey:1`)));
    return ethers.hexlify(Buffer.concat([Buffer.from(first), Buffer.from(second).subarray(0, 16)]));
}

function depositDataRoot(pubkey: string, withdrawalCredentials: string, amount: bigint, validatorSignature: string): string {
    const root = lodestarTypes.DepositData.hashTreeRoot({
        pubkey: Buffer.from(pubkey.slice(2), "hex"),
        withdrawalCredentials: Buffer.from(withdrawalCredentials.slice(2), "hex"),
        amount,
        signature: Buffer.from(validatorSignature.slice(2), "hex"),
    });
    return ethers.hexlify(root);
}

export class MinipoolActionsBase<C extends ProtocolContracts> extends GuardedFacade {
    get(name: string): MinipoolEntity {
        this.active();
        return this.view.context.minipool(name);
    }

    async stake(name: string, options: StakeMinipoolOptions = {}): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const contracts = this.view.contracts as C;
        const signer = await this.view.context.actor(options.caller ?? entity.node);
        const [storedPubkey, storedWithdrawalCredentials] = await Promise.all([
            contracts.rocketMinipoolManager.getMinipoolPubkey(entity.address),
            contracts.rocketMinipoolManager.getMinipoolWithdrawalCredentials(entity.address),
        ]);

        const pubkey = options.validatorPubkey ?? storedPubkey;
        const withdrawalCredentials = options.withdrawalCredentials ?? storedWithdrawalCredentials;

        const minipool = await connectMinipoolDelegate(entity.address, signer);
        const depositType = Number(await minipool.getDepositType());
        const amount = depositType === 4 ? 31_000_000_000n : 16_000_000_000n;
        const validatorSignature = signature(`${this.view.context.scopeId}:${name}:stake`);
        const root = depositDataRoot(pubkey, withdrawalCredentials, amount, validatorSignature);
        await (await minipool.stake(validatorSignature, root)).wait();

        const status = Number(await minipool.getStatus());
        if (status !== 2) throw new Error(`Minipool ${name} did not enter Staking status`);
        this.view.context.trace(`staked minipool ${name}`);
    }

    async count(): Promise<bigint> {
        this.active();
        return (this.view.contracts as C).rocketMinipoolManager.getMinipoolCount();
    }

    async withdrawalCredentials(name: string): Promise<string> {
        this.active();
        const entity = this.view.context.minipool(name);
        return (this.view.contracts as C).rocketMinipoolManager
            .getMinipoolWithdrawalCredentials(entity.address);
    }

    async rplSlashed(name: string): Promise<boolean> {
        this.active();
        const entity = this.view.context.minipool(name);
        return (this.view.contracts as C).rocketMinipoolManager
            .getMinipoolRPLSlashed(entity.address);
    }

    async details(name: string): Promise<MinipoolDetails> {
        this.active();
        const entity = this.view.context.minipool(name);
        const minipool = await connectMinipoolDelegate(entity.address, ethers.provider);
        const contracts = this.view.contracts as C;
        const [
            status,
            nodeFee,
            pubkey,
            depositType,
            nodeDepositBalance,
            nodeRefundBalance,
            userDepositBalance,
            balance,
            scrubVotes,
            vacant,
            finalised,
            userDistributed,
        ] = await Promise.all([
            minipool.getStatus(),
            minipool.getNodeFee(),
            contracts.rocketMinipoolManager.getMinipoolPubkey(entity.address),
            minipool.getDepositType(),
            minipool.getNodeDepositBalance(),
            minipool.getNodeRefundBalance(),
            minipool.getUserDepositBalance(),
            ethers.provider.getBalance(entity.address),
            minipool.getTotalScrubVotes(),
            minipool.getVacant(),
            minipool.getFinalised(),
            minipool.getUserDistributed(),
        ]);
        return {
            address: entity.address,
            status: Number(status),
            nodeFee,
            pubkey,
            depositType: Number(depositType),
            nodeDepositBalance,
            nodeRefundBalance,
            userDepositBalance,
            balance,
            scrubVotes,
            vacant,
            finalised,
            userDistributed,
        };
    }

    async delegate(name: string): Promise<MinipoolDelegateInfo> {
        this.active();
        const entity = this.view.context.minipool(name);
        const base = V131MinipoolBaseFactory.connect(entity.address, ethers.provider);
        const [version, storedAddress, previousAddress, effectiveAddress, useLatest] = await Promise.all([
            getMinipoolDelegateVersion(entity.address, ethers.provider),
            base.getDelegate(),
            base.getPreviousDelegate(),
            base.getEffectiveDelegate(),
            base.getUseLatestDelegate(),
        ]);
        return {
            version,
            storedAddress,
            previousAddress,
            effectiveAddress,
            useLatest,
        };
    }

    async delegateUpgrade(name: string, options: { caller?: string } = {}): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller ?? entity.node);
        await (await V131MinipoolBaseFactory.connect(entity.address, signer).delegateUpgrade()).wait();
        this.view.context.trace(`upgraded delegate for ${name}`);
    }

    async delegateRollback(name: string, options: { caller?: string } = {}): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller ?? entity.node);
        await (await V131MinipoolBaseFactory.connect(entity.address, signer).delegateRollback()).wait();
        this.view.context.trace(`rolled back delegate for ${name}`);
    }

    async setUseLatestDelegate(
        name: string,
        useLatest: boolean,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller ?? entity.node);
        await (await V131MinipoolBaseFactory.connect(entity.address, signer)
            .setUseLatestDelegate(useLatest)).wait();
        this.view.context.trace(`set use-latest delegate for ${name} to ${useLatest}`);
    }

    async addressForPubkey(pubkey: string): Promise<string> {
        this.active();
        const contracts = this.view.contracts as C;
        return contracts.rocketMinipoolManager.getMinipoolByPubkey(pubkey);
    }

    async voteScrub(name: string, options: { caller: string }): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller);
        const minipool = await connectMinipoolDelegate(entity.address, signer);
        await (await minipool.voteScrub()).wait();
        this.view.context.trace(`cast scrub vote for ${name} as ${options.caller}`);
    }

    async promote(name: string): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(entity.node);
        const minipool = await connectMinipoolDelegate(entity.address, signer);
        await (await minipool.promote()).wait();
        this.view.context.trace(`promoted vacant minipool ${name}`);
    }

    async dissolve(name: string, options: { caller: string }): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller);
        const minipool = await connectMinipoolDelegate(entity.address, signer);
        await (await minipool.dissolve()).wait();
        this.view.context.trace(`dissolved minipool ${name} as ${options.caller}`);
    }

    async finalise(name: string, options: { caller?: string } = {}): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller ?? entity.node);
        const minipool = await connectMinipoolDelegate(entity.address, signer);
        await (await minipool.finalise()).wait();
        this.view.context.trace(`finalised minipool ${name} as ${options.caller ?? entity.node}`);
    }

    async refund(
        name: string,
        options: { caller?: string; gasPrice?: bigint } = {},
    ): Promise<ContractTransactionReceipt> {
        this.active();
        const entity = this.view.context.minipool(name);
        const caller = options.caller ?? entity.node;
        const signer = await this.view.context.actor(caller);
        const minipool = await connectMinipoolDelegate(entity.address, signer);
        const transaction = await minipool.refund(
            options.gasPrice === undefined ? {} : { gasPrice: options.gasPrice },
        );
        const receipt = await transaction.wait();
        if (!receipt) throw new Error(`Refund transaction for minipool ${name} was not mined`);
        this.view.context.trace(`refunded minipool ${name} as ${caller}`);
        return receipt;
    }

    async fund(name: string, from: string, amount: bigint): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(from);
        await (await signer.sendTransaction({
            to: entity.address,
            value: amount,
        })).wait();
        this.view.context.trace(`funded minipool ${name} with ${amount} wei from ${from}`);
    }

    async close(
        name: string,
        options: { caller: string; gasPrice?: bigint },
    ): Promise<ContractTransactionReceipt> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller);
        const minipool = await connectMinipoolDelegate(entity.address, signer);
        const transaction = await minipool.close(
            options.gasPrice === undefined ? {} : { gasPrice: options.gasPrice },
        );
        const receipt = await transaction.wait();
        if (!receipt) throw new Error(`Close transaction for minipool ${name} was not mined`);
        this.view.context.trace(`closed minipool ${name} as ${options.caller}`);
        return receipt;
    }

    async reduceBond(name: string): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(entity.node);
        const minipool = await connectMinipoolDelegate(entity.address, signer);
        await (await minipool.reduceBondAmount()).wait();
    }

    async distributeBalance(
        name: string,
        options: { caller?: string; gasPrice?: bigint; rewardsOnly?: boolean } = {},
    ): Promise<ContractTransactionReceipt> {
        this.active();
        const entity = this.view.context.minipool(name);
        const caller = options.caller ?? entity.node;
        const signer = await this.view.context.actor(caller);
        const minipool = await connectMinipoolDelegate(entity.address, signer);
        const transaction = await minipool.distributeBalance(options.rewardsOnly ?? false, {
            ...(options.gasPrice === undefined ? {} : { gasPrice: options.gasPrice }),
        });
        const receipt = await transaction.wait();
        if (!receipt) throw new Error(`Distribution transaction for minipool ${name} was not mined`);
        this.view.context.trace(`distributed minipool ${name} balance as ${caller}`);
        return receipt;
    }

    async beginUserDistribute(
        name: string,
        options: { caller: string },
    ): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller);
        const minipool = await connectMinipoolDelegate(entity.address, signer);
        await (await minipool.beginUserDistribute()).wait();
        this.view.context.trace(`began user distribution for ${name} as ${options.caller}`);
    }

    async slash(name: string, options: { caller: string }): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller);
        const minipool = await connectMinipoolDelegate(entity.address, signer);
        await (await minipool.slash()).wait();
        this.view.context.trace(`slashed minipool ${name} as ${options.caller}`);
    }

    async setMaximumPenaltyRate(rate: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        const contracts = this.view.contracts as C;
        await (await contracts.rocketMinipoolPenalty.connect(guardian).setMaxPenaltyRate(rate)).wait();
        this.view.context.trace(`set maximum minipool penalty rate to ${rate}`);
    }

    async maximumPenaltyRate(): Promise<bigint> {
        this.active();
        const contracts = this.view.contracts as C;
        return contracts.rocketMinipoolPenalty.getMaxPenaltyRate();
    }

    async penaltyRate(name: string): Promise<bigint> {
        this.active();
        const entity = this.view.context.minipool(name);
        const contracts = this.view.contracts as C;
        return contracts.rocketMinipoolPenalty.getPenaltyRate(entity.address);
    }

    async forNode(name: string): Promise<NodeMinipoolDetails[]> {
        this.active();
        const contracts = this.view.contracts as C;
        const nodeAddress = await this.view.context.actorAddress(name);
        const count = Number(await contracts.rocketMinipoolManager.getNodeMinipoolCount(nodeAddress));

        return Promise.all(Array.from({ length: count }, async (_, index) => {
            const address = await contracts.rocketMinipoolManager.getNodeMinipoolAt(
                nodeAddress,
                index,
            );
            const minipool = await connectMinipoolDelegate(address, ethers.provider);
            const [status, nodeFee] = await Promise.all([
                minipool.getStatus(),
                minipool.getNodeFee(),
            ]);
            return {
                address,
                status: Number(status),
                nodeFee,
            };
        }));
    }
}

export class MinipoolActions131 extends MinipoolActionsBase<V131Contracts> {
    async beginBondReduction(
        name: string,
        newBond: bigint,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller ?? entity.node);
        const contracts = this.view.contracts as V131Contracts;
        await (await contracts.rocketMinipoolBondReducer.connect(signer)
            .beginReduceBondAmount(entity.address, newBond)).wait();
        this.view.context.trace(`began bond reduction for ${name} to ${newBond}`);
    }

    async cancelBondReduction(name: string, options: { caller: string }): Promise<void> {
        this.active();
        const entity = this.view.context.minipool(name);
        const signer = await this.view.context.actor(options.caller);
        const contracts = this.view.contracts as V131Contracts;
        await (await contracts.rocketMinipoolBondReducer.connect(signer)
            .voteCancelReduction(entity.address)).wait();
        this.view.context.trace(`voted to cancel bond reduction for ${name} as ${options.caller}`);
    }

    async bondReduction(name: string): Promise<MinipoolBondReductionInfo> {
        this.active();
        const entity = this.view.context.minipool(name);
        const reducer = (this.view.contracts as V131Contracts).rocketMinipoolBondReducer;
        const [time, value, cancelled] = await Promise.all([
            reducer.getReduceBondTime(entity.address),
            reducer.getReduceBondValue(entity.address),
            reducer.getReduceBondCancelled(entity.address),
        ]);
        return { time, value, cancelled };
    }

    async create(
        name: string,
        options: { node: string; bond: bigint; salt?: bigint },
    ): Promise<MinipoolEntity> {
        this.active();
        if (this.view.context.hasMinipool(name)) throw new Error(`Minipool already exists: ${name}`);
        const contracts = this.view.contracts as V131Contracts;
        const node = await this.view.context.actor(options.node);
        const nodeAddress = await node.getAddress();
        const salt = options.salt
            ?? BigInt(ethers.keccak256(ethers.toUtf8Bytes(`${this.view.context.scopeId}:${name}:salt`)));
        const expectedAddress = await contracts.rocketMinipoolFactory.getExpectedAddress(nodeAddress, salt);
        const withdrawalCredentials = `0x010000000000000000000000${expectedAddress.slice(2)}`;
        const pubkey = validatorPubkey(`${this.view.context.scopeId}:${name}`);
        const validatorSignature = signature(`${this.view.context.scopeId}:${name}:create`);
        const root = depositDataRoot(pubkey, withdrawalCredentials, 1_000_000_000n, validatorSignature);

        await (await contracts.rocketNodeDeposit.connect(node).deposit(
            options.bond,
            0n,
            pubkey,
            validatorSignature,
            root,
            salt,
            expectedAddress,
            { value: options.bond },
        )).wait();

        const entity: MinipoolEntity = {
            address: expectedAddress,
            node: options.node,
            bond: options.bond,
            createdRelease: "1.3.1",
            provenance: "lifecycle",
            pubkey,
            salt,
        };
        this.view.context.addMinipool(name, entity);
        this.view.context.trace(`created minipool ${name} at ${expectedAddress}`);
        return entity;
    }

    async createVacant(
        name: string,
        options: {
            node: string;
            bond: bigint;
            currentBalance?: bigint;
            pubkey?: string;
            salt?: bigint;
        },
    ): Promise<MinipoolEntity> {
        this.active();
        if (this.view.context.hasMinipool(name)) {
            throw new Error(`Minipool already exists: ${name}`);
        }
        if (options.bond !== 8n * 10n ** 18n && options.bond !== 16n * 10n ** 18n) {
            throw new Error("Historical vacant minipool bond must be 8 or 16 ETH");
        }

        const contracts = this.view.contracts as V131Contracts;
        const node = await this.view.context.actor(options.node);
        const nodeAddress = await node.getAddress();
        const salt = options.salt
            ?? BigInt(ethers.keccak256(
                ethers.toUtf8Bytes(`${this.view.context.scopeId}:${name}:vacant-salt`),
            ));
        const expectedAddress = await contracts.rocketMinipoolFactory.getExpectedAddress(
            nodeAddress,
            salt,
        );
        const pubkey = options.pubkey
            ?? validatorPubkey(`${this.view.context.scopeId}:${name}:vacant`);
        const currentBalance = options.currentBalance ?? 32n * 10n ** 18n;

        await (await contracts.rocketNodeDeposit.connect(node).createVacantMinipool(
            options.bond,
            0n,
            pubkey,
            salt,
            expectedAddress,
            currentBalance,
        )).wait();

        const entity: MinipoolEntity = {
            address: expectedAddress,
            node: options.node,
            bond: options.bond,
            createdRelease: "1.3.1",
            provenance: "lifecycle",
            pubkey,
            salt,
        };
        this.view.context.addMinipool(name, entity);
        this.view.context.trace(`created vacant minipool ${name} at ${expectedAddress}`);
        return entity;
    }
}
