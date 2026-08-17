import type { ProtocolContext } from "../context";
import type { Release } from "../releases/catalog";

export abstract class ActiveProtocolView<R extends Release, C> {
    abstract readonly release: R;
    readonly epoch: number;

    constructor(
        readonly context: ProtocolContext,
        readonly contracts: C,
    ) {
        this.epoch = context.epoch;
    }

    assertActive(): void {
        if (this.context.epoch !== this.epoch || this.context.release !== this.release) {
            throw new Error(
                `Stale Rocket Pool ${this.release} view; active release is ${this.context.release ?? "uninitialised"}`,
            );
        }
    }
}

export abstract class GuardedFacade {
    constructor(protected readonly view: ActiveProtocolView<any, any>) {}

    protected active(): void {
        this.view.assertActive();
    }
}
