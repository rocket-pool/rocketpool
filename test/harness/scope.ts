import { AsyncLocalStorage } from "async_hooks";

import { network } from "../../test-old/_utils/hardhat-runtime";
import { ProtocolContext } from "./context";
import { checkProtocolInvariants } from "./invariants";

interface ActiveExecution {
    context: ProtocolContext;
}

const execution = new AsyncLocalStorage<ActiveExecution>();
let scopeCounter = 0;

class HarnessBaseline {
    private entrySnapshot: string | null = null;
    private baselineSnapshot: string | null = null;
    private context: ProtocolContext | null = null;

    async initialize(): Promise<void> {
        if (this.context || this.entrySnapshot || this.baselineSnapshot) {
            throw new Error("Harness baseline has already been initialized");
        }

        this.entrySnapshot = await network.provider.send("evm_snapshot");
        try {
            const context = new ProtocolContext("harness/v1.3.1");
            await context.ensure("1.3.1");
            this.context = context;
            this.baselineSnapshot = await network.provider.send("evm_snapshot");
        } catch (error) {
            await this.restoreEntrySnapshot();
            throw error;
        }
    }

    async checkout(scopeId: string): Promise<ProtocolContext> {
        await this.restoreBaseline();
        return this.requireContext().cloneForRoot(scopeId);
    }

    async release(): Promise<void> {
        await this.restoreBaseline();
    }

    async dispose(): Promise<void> {
        await this.restoreEntrySnapshot();
        this.baselineSnapshot = null;
        this.context = null;
    }

    private requireContext(): ProtocolContext {
        if (!this.context) throw new Error("Harness baseline has not been initialized");
        return this.context;
    }

    private async restoreBaseline(): Promise<void> {
        if (!this.baselineSnapshot) {
            throw new Error("Harness v1.3.1 baseline snapshot is unavailable");
        }
        const restored = await network.provider.send("evm_revert", [this.baselineSnapshot]);
        if (!restored) throw new Error("Unable to restore harness v1.3.1 baseline");
        this.baselineSnapshot = await network.provider.send("evm_snapshot");
    }

    private async restoreEntrySnapshot(): Promise<void> {
        if (!this.entrySnapshot) return;
        const restored = await network.provider.send("evm_revert", [this.entrySnapshot]);
        if (!restored) throw new Error("Unable to restore the pre-harness EVM state");
        this.entrySnapshot = null;
    }
}

const harnessBaseline = new HarnessBaseline();

export function initializeHarnessBaseline(): Promise<void> {
    return harnessBaseline.initialize();
}

export function disposeHarnessBaseline(): Promise<void> {
    return harnessBaseline.dispose();
}

export class HarnessScope {
    readonly id: string;
    private baseline: string | null = null;
    private setupContext: ProtocolContext;
    private testContext: ProtocolContext | null = null;

    constructor(
        readonly title: string,
        readonly parent: HarnessScope | null,
    ) {
        this.id = `${parent?.id ?? "root"}/${++scopeCounter}:${title}`;
        this.setupContext = parent
            ? parent.setupContext.clone(this.id)
            : new ProtocolContext(this.id);
    }

    async enter(): Promise<void> {
        if (this.parent) {
            await this.parent.restoreBaseline();
            this.setupContext = this.parent.setupContext.clone(this.id);
        } else {
            this.setupContext = await harnessBaseline.checkout(this.id);
        }
    }

    async captureBaseline(): Promise<void> {
        if (this.baseline) {
            await network.provider.send("evm_revert", [this.baseline]);
        }
        this.baseline = await network.provider.send("evm_snapshot");
    }

    async restoreBaseline(): Promise<void> {
        if (!this.baseline) {
            throw new Error(`Harness suite "${this.title}" has no baseline snapshot`);
        }
        const restored = await network.provider.send("evm_revert", [this.baseline]);
        if (!restored) throw new Error(`Unable to restore harness suite "${this.title}"`);
        this.baseline = await network.provider.send("evm_snapshot");
    }

    async beginTest(): Promise<void> {
        await this.restoreBaseline();
        this.testContext = this.setupContext.clone(`${this.id}/test`);
    }

    async endTest(): Promise<void> {
        if (!this.testContext) {
            throw new Error(`Test context is not active for "${this.title}"`);
        }

        let invariantError: unknown;
        try {
            await checkProtocolInvariants(this.testContext);
        } catch (error) {
            invariantError = error;
        }

        this.testContext = null;
        let restoreError: unknown;
        try {
            await this.restoreBaseline();
        } catch (error) {
            restoreError = error;
        }

        if (invariantError && restoreError) {
            throw new AggregateError(
                [invariantError, restoreError],
                `Protocol invariant check and snapshot restore both failed for "${this.title}"`,
            );
        }
        if (invariantError) throw invariantError;
        if (restoreError) throw restoreError;
    }

    async leave(): Promise<void> {
        if (this.parent) {
            await this.parent.restoreBaseline();
        } else {
            await harnessBaseline.release();
        }
    }

    runSetup<T>(callback: () => Promise<T> | T): Promise<T> | T {
        return execution.run({ context: this.setupContext }, callback);
    }

    runTest<T>(callback: () => Promise<T> | T): Promise<T> | T {
        if (!this.testContext) throw new Error(`Test context is not active for "${this.title}"`);
        return execution.run({ context: this.testContext }, callback);
    }
}

export function loadContext(): ProtocolContext {
    const active = execution.getStore();
    if (!active) {
        throw new Error("load() may only be called inside harness-managed before/it hooks");
    }
    return active.context;
}
