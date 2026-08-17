import type {
    CurrentContracts,
    ProtocolContracts,
    V14Contracts,
} from "../contracts";
import { GuardedFacade } from "../view";

export class DepositPoolActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async deposit(name: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketDepositPool.connect(signer).deposit({ value: amount })).wait();
        this.view.context.trace(`funded deposit pool with ${amount} wei from ${name}`);
    }

    fund(name: string, amount: bigint): Promise<void> {
        return this.deposit(name, amount);
    }

    async balances(): Promise<{ total: bigint; user: bigint; node: bigint }> {
        this.active();
        const [total, user, node] = await Promise.all([
            this.contracts.rocketDepositPool.getBalance(),
            this.contracts.rocketDepositPool.getUserBalance(),
            this.contracts.rocketDepositPool.getNodeBalance(),
        ]);
        return { total, user, node };
    }

    async minimumDeposit(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolSettingsDeposit.getMinimumDeposit();
    }

    async depositFee(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolSettingsDeposit.getDepositFee();
    }

    async maximumDepositAmount(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDepositPool.getMaximumDepositAmount();
    }

    async excessBalance(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDepositPool.getExcessBalance();
    }

}

type AssignableDepositPoolContracts = V14Contracts | CurrentContracts;

export class DepositPoolActionsV14<C extends AssignableDepositPoolContracts>
    extends DepositPoolActions<C> {
    async queueLength(): Promise<bigint> {
        this.active();
        const contracts = this.view.contracts as C;
        return contracts.rocketDepositPool.getTotalQueueLength();
    }

    async assign(max: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const contracts = this.view.contracts as C;
        const signer = await this.view.context.actor(options.caller);
        await (await contracts.rocketDepositPool.connect(signer).assignDeposits(max)).wait();
        this.view.context.trace(`assigned up to ${max} queued deposits as ${options.caller}`);
    }
}
