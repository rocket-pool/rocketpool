import { Contract, Signer } from "ethers";

import {
    connectCurrent,
    connectV131,
    connectV14,
} from "./protocol/connections";
import type { MinipoolEntity } from "./protocol/domains/minipools";
import type {
    ProtocolByRelease,
    ProtocolCurrent,
    ProtocolV131,
    ProtocolV14,
} from "./protocol/releases";
import type { ActiveProtocolView } from "./protocol/view";
import {
    DeploymentState,
    deployV131,
    upgradeToCurrent,
    upgradeToV14,
} from "./deployment";
import {
    FixtureKind,
    FixtureRecord,
    FixtureRegistry,
} from "./fixtures";
import { getReleaseArtifact, HistoricalRelease, Release } from "./releases/catalog";
import { ethers } from "../../test-old/_utils/hardhat-runtime";

function cloneDeployment(state: DeploymentState): DeploymentState {
    return {
        rocketStorageAddress: state.rocketStorageAddress,
        activeRelease: state.activeRelease,
        active: new Map([...state.active].map(([name, entry]) => [name, { ...entry }])),
        history: new Map([...state.history].map(([name, entries]) => [
            name,
            entries.map(entry => ({ ...entry })),
        ])),
    };
}

export class HistoricalBindings {
    constructor(private readonly context: ProtocolContext) {}

    get(release: HistoricalRelease, logicalName: string): Contract {
        const candidates = [
            ...(this.context.deployment.history.get(logicalName) ?? []),
            this.context.deployment.active.get(logicalName),
        ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
        const entry = candidates.find(candidate => candidate.release === release);
        if (!entry) {
            throw new Error(`No ${release} deployment recorded for ${logicalName}`);
        }
        return new Contract(
            entry.address,
            getReleaseArtifact(release, entry.artifactName).abi,
            ethers.provider,
        );
    }
}

export class ProtocolContext {
    private _deployment: DeploymentState | null = null;
    private readonly actorIndexes = new Map<string, number>();
    private readonly fixtureRecords = new Map<string, FixtureRecord>();
    private readonly minipools = new Map<string, MinipoolEntity>();
    private readonly traceEntries: string[] = [];
    private _epoch = 0;
    private _releaseClaimed = false;

    readonly historical = new HistoricalBindings(this);
    readonly fixtures = new FixtureRegistry(this);

    constructor(readonly scopeId: string) {}

    get epoch(): number {
        return this._epoch;
    }

    get release(): Release | null {
        return this._deployment?.activeRelease ?? null;
    }

    get deployment(): DeploymentState {
        if (!this._deployment) throw new Error("Rocket Pool has not been initialised in this scope");
        return this._deployment;
    }

    clone(scopeId: string): ProtocolContext {
        const clone = new ProtocolContext(scopeId);
        clone._deployment = this._deployment ? cloneDeployment(this._deployment) : null;
        clone._epoch = this._epoch;
        clone._releaseClaimed = this._releaseClaimed;
        for (const [name, index] of this.actorIndexes) clone.actorIndexes.set(name, index);
        for (const [name, record] of this.fixtureRecords) {
            clone.fixtureRecords.set(name, { ...record });
        }
        for (const [name, entity] of this.minipools) clone.minipools.set(name, { ...entity });
        clone.traceEntries.push(...this.traceEntries);
        return clone;
    }

    cloneForRoot(scopeId: string): ProtocolContext {
        const clone = this.clone(scopeId);
        clone._releaseClaimed = false;
        return clone;
    }

    async guardian(): Promise<Signer> {
        const signers = await ethers.getSigners();
        return signers[0];
    }

    async actor(name: string): Promise<Signer> {
        const signers = await ethers.getSigners();
        let index = this.actorIndexes.get(name);
        if (index === undefined) {
            index = this.actorIndexes.size + 1;
            if (index >= signers.length) throw new Error(`No signer available for actor ${name}`);
            this.actorIndexes.set(name, index);
            this.trace(`assigned actor ${name} to signer ${index}`);
        }
        return signers[index];
    }

    async actorAddress(name: string): Promise<string> {
        return (await this.actor(name)).getAddress();
    }

    hasFixture(name: string): boolean {
        return this.fixtureRecords.has(name);
    }

    addFixture(name: string, record: FixtureRecord): void {
        if (this.fixtureRecords.has(name)) throw new Error(`Fixture already exists: ${name}`);
        this.fixtureRecords.set(name, { ...record });
    }

    getFixture(name: string, expectedKind: FixtureKind): FixtureRecord {
        const record = this.fixtureRecords.get(name);
        if (!record) throw new Error(`Unknown fixture: ${name}`);
        if (record.kind !== expectedKind) {
            throw new Error(
                `Fixture ${name} is ${record.kind}, expected ${expectedKind}`,
            );
        }
        return { ...record };
    }

    trace(message: string): void {
        this.traceEntries.push(`[${this.release ?? "uninitialised"}] ${message}`);
    }

    getTrace(): readonly string[] {
        return this.traceEntries;
    }

    hasMinipool(name: string): boolean {
        return this.minipools.has(name);
    }

    minipool(name: string): MinipoolEntity {
        const entity = this.minipools.get(name);
        if (!entity) throw new Error(`Unknown minipool: ${name}`);
        return entity;
    }

    addMinipool(name: string, entity: MinipoolEntity): void {
        if (this.minipools.has(name)) throw new Error(`Minipool already exists: ${name}`);
        this.minipools.set(name, entity);
    }

    async ensure<V extends Release>(release: V): Promise<ProtocolByRelease[V]> {
        if (!this._deployment) {
            this._deployment = await deployV131();
            this._epoch++;
            this.trace("initialised immutable 1.3.1 release");
            await this.selectInitialRelease(release);
        } else if (!this._releaseClaimed) {
            await this.selectInitialRelease(release);
        } else if (this.release !== release) {
            throw new Error(
                `Expected Rocket Pool ${release}, but this scope contains ${this.release}. `
                + "Use upgradeTo() for an explicit forward transition.",
            );
        }
        this._releaseClaimed = true;
        return this.connect(release);
    }

    private async selectInitialRelease(release: Release): Promise<void> {
        if (this.release !== "1.3.1") {
            throw new Error(`Initial release selection requires a v1.3.1 baseline, got ${this.release}`);
        }
        if (release === "1.4" || release === "current") {
            await upgradeToV14(this.deployment);
            this._epoch++;
            this.trace("upgraded to 1.4");
        }
        if (release === "current") {
            await upgradeToCurrent(this.deployment);
            this._epoch++;
            this.trace("upgraded to current");
        }
    }

    async upgradeFrom(
        view: ProtocolV131,
        target: "1.4",
    ): Promise<ProtocolV14>;
    async upgradeFrom(
        view: ProtocolV131,
        target: "current",
    ): Promise<ProtocolCurrent>;
    async upgradeFrom(
        view: ProtocolV14,
        target: "current",
    ): Promise<ProtocolCurrent>;
    async upgradeFrom(
        view: ActiveProtocolView<any, any>,
        target: "1.4" | "current",
    ): Promise<ProtocolV14 | ProtocolCurrent> {
        view.assertActive();
        if (this.release === "1.3.1" && (target === "1.4" || target === "current")) {
            await upgradeToV14(this.deployment);
            this._epoch++;
            this.trace("upgraded to 1.4");
        }
        if (target === "current" && this.release === "1.4") {
            await upgradeToCurrent(this.deployment);
            this._epoch++;
            this.trace("upgraded to current");
        }
        if (this.release !== target) {
            throw new Error(`No supported upgrade path from ${this.release} to ${target}`);
        }
        return this.connect(target);
    }

    private connect<V extends Release>(release: V): ProtocolByRelease[V] {
        switch (release) {
            case "1.3.1":
                return connectV131(this) as ProtocolByRelease[V];
            case "1.4":
                return connectV14(this) as ProtocolByRelease[V];
            case "current":
                return connectCurrent(this) as ProtocolByRelease[V];
        }
    }

}
