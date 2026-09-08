import {
    MegapoolUpgradeHelper__factory,
    PenaltyTest__factory,
    RevertOnTransfer__factory,
    RplStakeController__factory,
    StorageHelper__factory,
} from "./bindings/fixtures";
import { RocketMegapoolDelegate__factory } from "./bindings/current";
import { RocketDAONodeTrustedUpgrade__factory } from "./bindings/v1_4";
import { ethers } from "../../test-old/_utils/hardhat-runtime";
import type { ProtocolContext } from "./context";
import { getActiveAddress } from "./deployment";

export type FixtureKind =
    | "revertingReceiver"
    | "rplStakeController"
    | "minipoolPenaltyController"
    | "storageHelper"
    | "megapoolUpgradeHelper";

export interface FixtureRecord {
    kind: FixtureKind;
    address: string;
    delegateAddress?: string;
}

async function registerNetworkContract(
    context: ProtocolContext,
    name: string,
    abi: readonly unknown[],
    address: string,
): Promise<void> {
    const guardian = await context.guardian();
    const odaoUpgrade = RocketDAONodeTrustedUpgrade__factory.connect(
        getActiveAddress(context.deployment, "rocketDAONodeTrustedUpgrade"),
        guardian,
    );
    await (await odaoUpgrade.bootstrapUpgrade(
        "addContract",
        name,
        JSON.stringify(abi),
        address,
    )).wait();
}

export class RevertingReceiverFixture {
    constructor(
        private readonly context: ProtocolContext,
        readonly name: string,
        readonly address: string,
    ) {}

    async setEnabled(enabled: boolean): Promise<void> {
        const guardian = await this.context.guardian();
        await (await RevertOnTransfer__factory.connect(
            this.address,
            guardian,
        ).setEnabled(enabled)).wait();
        this.context.trace(`set reverting receiver ${this.name} to ${enabled}`);
    }

    async setCallback(target: string, data: string): Promise<void> {
        const guardian = await this.context.guardian();
        await (await RevertOnTransfer__factory.connect(
            this.address,
            guardian,
        ).setCallback(target, data)).wait();
        this.context.trace(`set callback on reverting receiver ${this.name}`);
    }

    async callbackSucceeded(): Promise<boolean> {
        return RevertOnTransfer__factory.connect(
            this.address,
            ethers.provider,
        ).callbackSucceeded();
    }

    async callbackCount(): Promise<bigint> {
        return RevertOnTransfer__factory.connect(
            this.address,
            ethers.provider,
        ).callbackCount();
    }

    balance(): Promise<bigint> {
        return ethers.provider.getBalance(this.address);
    }

    async call(target: string, data: string, value = 0n): Promise<void> {
        const guardian = await this.context.guardian();
        await (await RevertOnTransfer__factory.connect(this.address, guardian).call(
            target,
            data,
            { value },
        )).wait();
        this.context.trace(`called ${target} through reverting receiver ${this.name}`);
    }
}

export class RevertingReceiverFixtures {
    constructor(private readonly context: ProtocolContext) {}

    async deploy(name: string): Promise<RevertingReceiverFixture> {
        if (this.context.hasFixture(name)) throw new Error(`Fixture already exists: ${name}`);
        const guardian = await this.context.guardian();
        const receiver = await new RevertOnTransfer__factory(guardian).deploy();
        await receiver.waitForDeployment();
        const address = await receiver.getAddress();
        this.context.addFixture(name, {
            kind: "revertingReceiver",
            address,
        });
        this.context.trace(`deployed reverting receiver ${name} at ${address}`);
        return new RevertingReceiverFixture(this.context, name, address);
    }

    get(name: string): RevertingReceiverFixture {
        const record = this.context.getFixture(name, "revertingReceiver");
        return new RevertingReceiverFixture(this.context, name, record.address);
    }
}

export class RplStakeControllerFixture {
    constructor(
        private readonly context: ProtocolContext,
        readonly name: string,
        readonly address: string,
    ) {}

    private contract() {
        return RplStakeController__factory.connect(this.address, ethers.provider);
    }

    async lock(node: string, amount: bigint): Promise<void> {
        const guardian = await this.context.guardian();
        await (await this.contract().connect(guardian).lock(
            await this.context.actorAddress(node),
            amount,
        )).wait();
        this.context.trace(`locked ${amount} RPL for ${node} through ${this.name}`);
    }

    async unlock(node: string, amount: bigint): Promise<void> {
        const guardian = await this.context.guardian();
        await (await this.contract().connect(guardian).unlock(
            await this.context.actorAddress(node),
            amount,
        )).wait();
        this.context.trace(`unlocked ${amount} RPL for ${node} through ${this.name}`);
    }

    async transfer(from: string, to: string, amount: bigint): Promise<void> {
        const guardian = await this.context.guardian();
        await (await this.contract().connect(guardian).transfer(
            await this.context.actorAddress(from),
            await this.context.actorAddress(to),
            amount,
        )).wait();
        this.context.trace(`transferred ${amount} staked RPL from ${from} to ${to} through ${this.name}`);
    }

    async burn(node: string, amount: bigint): Promise<void> {
        const guardian = await this.context.guardian();
        await (await this.contract().connect(guardian).burn(
            await this.context.actorAddress(node),
            amount,
        )).wait();
        this.context.trace(`burned ${amount} staked RPL for ${node} through ${this.name}`);
    }
}

export class RplStakeControllerFixtures {
    constructor(private readonly context: ProtocolContext) {}

    async deploy(name: string): Promise<RplStakeControllerFixture> {
        if (this.context.hasFixture(name)) throw new Error(`Fixture already exists: ${name}`);
        if (this.context.release !== "current") {
            throw new Error("RPL stake controller fixtures require the current protocol release");
        }
        const guardian = await this.context.guardian();
        const controller = await new RplStakeController__factory(guardian).deploy(
            this.context.deployment.rocketStorageAddress,
        );
        await controller.waitForDeployment();
        const address = await controller.getAddress();
        await registerNetworkContract(
            this.context,
            `testRplStakeController.${name}`,
            RplStakeController__factory.abi,
            address,
        );
        this.context.addFixture(name, { kind: "rplStakeController", address });
        this.context.trace(`deployed and registered RPL stake controller ${name} at ${address}`);
        return new RplStakeControllerFixture(this.context, name, address);
    }

    get(name: string): RplStakeControllerFixture {
        const record = this.context.getFixture(name, "rplStakeController");
        return new RplStakeControllerFixture(this.context, name, record.address);
    }
}

export class MinipoolPenaltyControllerFixture {
    constructor(
        private readonly context: ProtocolContext,
        readonly name: string,
        readonly address: string,
    ) {}

    async setRate(minipool: string, rate: bigint): Promise<void> {
        const guardian = await this.context.guardian();
        const minipoolAddress = this.context.minipool(minipool).address;
        await (await PenaltyTest__factory.connect(this.address, guardian).setPenaltyRate(
            minipoolAddress,
            rate,
        )).wait();
        this.context.trace(`set penalty rate for ${minipool} to ${rate} through ${this.name}`);
    }
}

export class MinipoolPenaltyControllerFixtures {
    constructor(private readonly context: ProtocolContext) {}

    async deploy(name: string): Promise<MinipoolPenaltyControllerFixture> {
        if (this.context.hasFixture(name)) throw new Error(`Fixture already exists: ${name}`);
        if (this.context.release !== "current") {
            throw new Error("Minipool penalty controller fixtures require the current protocol release");
        }
        const guardian = await this.context.guardian();
        const controller = await new PenaltyTest__factory(guardian).deploy(
            this.context.deployment.rocketStorageAddress,
        );
        await controller.waitForDeployment();
        const address = await controller.getAddress();
        await registerNetworkContract(
            this.context,
            `testMinipoolPenaltyController.${name}`,
            PenaltyTest__factory.abi,
            address,
        );
        this.context.addFixture(name, { kind: "minipoolPenaltyController", address });
        this.context.trace(`deployed and registered minipool penalty controller ${name} at ${address}`);
        return new MinipoolPenaltyControllerFixture(this.context, name, address);
    }

    get(name: string): MinipoolPenaltyControllerFixture {
        const record = this.context.getFixture(name, "minipoolPenaltyController");
        return new MinipoolPenaltyControllerFixture(this.context, name, record.address);
    }
}

export class StorageFixture {
    constructor(
        private readonly context: ProtocolContext,
        readonly name: string,
        readonly address: string,
    ) {}

    async setUint(key: string, value: bigint): Promise<void> {
        const guardian = await this.context.guardian();
        await (await StorageHelper__factory.connect(this.address, guardian).setUint(key, value)).wait();
        this.context.trace(`set storage ${key} to ${value} through ${this.name}`);
    }

    getUint(key: string): Promise<bigint> {
        return StorageHelper__factory.connect(this.address, ethers.provider).getUint(key);
    }
}

export class StorageFixtures {
    constructor(private readonly context: ProtocolContext) {}

    async deploy(name: string): Promise<StorageFixture> {
        if (this.context.hasFixture(name)) throw new Error(`Fixture already exists: ${name}`);
        const guardian = await this.context.guardian();
        const helper = await new StorageHelper__factory(guardian).deploy(
            this.context.deployment.rocketStorageAddress,
        );
        await helper.waitForDeployment();
        const address = String(helper.target);
        await registerNetworkContract(
            this.context,
            `testStorageHelper.${name}`,
            StorageHelper__factory.abi,
            address,
        );
        this.context.addFixture(name, { kind: "storageHelper", address });
        this.context.trace(`deployed storage helper ${name} at ${address}`);
        return new StorageFixture(this.context, name, address);
    }

    get(name: string): StorageFixture {
        const record = this.context.getFixture(name, "storageHelper");
        return new StorageFixture(this.context, name, record.address);
    }
}

const WITHDRAWAL_REQUEST_PREDEPLOY = "0x00000961Ef480Eb55e80D19ad83579A64c007002";

export class MegapoolUpgradeFixture {
    constructor(
        private readonly context: ProtocolContext,
        readonly name: string,
        readonly address: string,
        readonly delegateAddress: string,
    ) {}

    async upgradeDelegate(): Promise<void> {
        const guardian = await this.context.guardian();
        await (await MegapoolUpgradeHelper__factory.connect(this.address, guardian)
            .upgradeDelegate(this.delegateAddress)).wait();
        this.context.trace(`upgraded megapool delegate through ${this.name}`);
    }
}

export class MegapoolUpgradeFixtures {
    constructor(private readonly context: ProtocolContext) {}

    async deploy(name: string): Promise<MegapoolUpgradeFixture> {
        if (this.context.hasFixture(name)) throw new Error(`Fixture already exists: ${name}`);
        if (this.context.release !== "current") {
            throw new Error("Megapool upgrade fixtures require the current protocol release");
        }
        const guardian = await this.context.guardian();
        const storageAddress = this.context.deployment.rocketStorageAddress;
        const helper = await new MegapoolUpgradeHelper__factory(guardian).deploy(storageAddress);
        const delegate = await new RocketMegapoolDelegate__factory(guardian).deploy(
            storageAddress,
            WITHDRAWAL_REQUEST_PREDEPLOY,
        );
        await Promise.all([helper.waitForDeployment(), delegate.waitForDeployment()]);
        const address = await helper.getAddress();
        const delegateAddress = await delegate.getAddress();
        await registerNetworkContract(
            this.context,
            `testMegapoolUpgradeHelper.${name}`,
            MegapoolUpgradeHelper__factory.abi,
            address,
        );
        this.context.addFixture(name, { kind: "megapoolUpgradeHelper", address, delegateAddress });
        this.context.trace(`deployed megapool upgrade helper ${name} at ${address}`);
        return new MegapoolUpgradeFixture(this.context, name, address, delegateAddress);
    }

    get(name: string): MegapoolUpgradeFixture {
        const record = this.context.getFixture(name, "megapoolUpgradeHelper");
        if (!record.delegateAddress) throw new Error(`Fixture ${name} has no delegate address`);
        return new MegapoolUpgradeFixture(
            this.context,
            name,
            record.address,
            record.delegateAddress,
        );
    }
}

export class FixtureRegistry {
    readonly revertingReceiver: RevertingReceiverFixtures;
    readonly rplStakeController: RplStakeControllerFixtures;
    readonly minipoolPenaltyController: MinipoolPenaltyControllerFixtures;
    readonly storage: StorageFixtures;
    readonly megapoolUpgrade: MegapoolUpgradeFixtures;

    constructor(context: ProtocolContext) {
        this.revertingReceiver = new RevertingReceiverFixtures(context);
        this.rplStakeController = new RplStakeControllerFixtures(context);
        this.minipoolPenaltyController = new MinipoolPenaltyControllerFixtures(context);
        this.storage = new StorageFixtures(context);
        this.megapoolUpgrade = new MegapoolUpgradeFixtures(context);
    }
}
