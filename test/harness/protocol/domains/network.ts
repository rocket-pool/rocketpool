import type {
    CurrentContracts,
    ProtocolContracts,
    V14Contracts,
} from "../contracts";
import type { ActiveProtocolView } from "../view";
import { GuardedFacade } from "../view";
import { ethers } from "../../../../test-old/_utils/hardhat-runtime";

export interface PriceSubmission {
    caller: string;
    block: bigint;
    slotTimestamp: bigint;
    rplPrice: bigint;
}

export interface BalanceSubmission {
    caller: string;
    block: bigint;
    slotTimestamp: bigint;
    totalEth: bigint;
    stakingEth: bigint;
    rethSupply: bigint;
}

export class NetworkPriceActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async submit(options: PriceSubmission): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketNetworkPrices.connect(signer).submitPrices(
            options.block,
            options.slotTimestamp,
            options.rplPrice,
        )).wait();
    }

    async execute(options: PriceSubmission): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketNetworkPrices.connect(signer).executeUpdatePrices(
            options.block,
            options.slotTimestamp,
            options.rplPrice,
        )).wait();
    }

    async details(): Promise<{ block: bigint; rplPrice: bigint }> {
        this.active();
        const [block, rplPrice] = await Promise.all([
            this.contracts.rocketNetworkPrices.getPricesBlock(),
            this.contracts.rocketNetworkPrices.getRPLPrice(),
        ]);
        return { block, rplPrice };
    }
}

export class NetworkBalanceActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async submit(options: BalanceSubmission): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketNetworkBalances.connect(signer).submitBalances(
            options.block,
            options.slotTimestamp,
            options.totalEth,
            options.stakingEth,
            options.rethSupply,
        )).wait();
    }

    async execute(options: BalanceSubmission): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketNetworkBalances.connect(signer).executeUpdateBalances(
            options.block,
            options.slotTimestamp,
            options.totalEth,
            options.stakingEth,
            options.rethSupply,
        )).wait();
    }

    async details(): Promise<{
        block: bigint;
        timestamp: bigint;
        totalEth: bigint;
        stakingEth: bigint;
        rethSupply: bigint;
    }> {
        this.active();
        const [block, timestamp, totalEth, stakingEth, rethSupply] = await Promise.all([
            this.contracts.rocketNetworkBalances.getBalancesBlock(),
            this.contracts.rocketStorage.getUint(
                ethers.solidityPackedKeccak256(["string"], ["network.balances.updated.timestamp"]),
            ),
            this.contracts.rocketNetworkBalances.getTotalETHBalance(),
            this.contracts.rocketNetworkBalances.getStakingETHBalance(),
            this.contracts.rocketNetworkBalances.getTotalRETHSupply(),
        ]);
        return { block, timestamp, totalEth, stakingEth, rethSupply };
    }
}

export class NetworkActions<C extends ProtocolContracts> {
    readonly prices: NetworkPriceActions<C>;
    readonly balances: NetworkBalanceActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        this.prices = new NetworkPriceActions<C>(view);
        this.balances = new NetworkBalanceActions<C>(view);
    }
}

type VotingContracts = V14Contracts | CurrentContracts;

export class NetworkVotingActions<C extends VotingContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async power(node: string, block: bigint): Promise<bigint> {
        this.active();
        return this.contracts.rocketNetworkVoting.getVotingPower(
            await this.view.context.actorAddress(node),
            block,
        );
    }

    nodeCount(block: bigint): Promise<bigint> {
        this.active();
        return this.contracts.rocketNetworkVoting.getNodeCount(block);
    }

    async delegate(node: string, block: bigint): Promise<string> {
        this.active();
        return this.contracts.rocketNetworkVoting.getDelegate(
            await this.view.context.actorAddress(node),
            block,
        );
    }

    async setDelegate(node: string, delegate: string): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(node);
        await (await this.contracts.rocketNetworkVoting.connect(signer).setDelegate(
            await this.view.context.actorAddress(delegate),
        )).wait();
    }
}

export class NetworkRevenueActions<C extends VotingContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async shares(): Promise<{ node: bigint; voter: bigint }> {
        this.active();
        const [node, voter] = await Promise.all([
            this.contracts.rocketNetworkRevenues.getCurrentNodeShare(),
            this.contracts.rocketNetworkRevenues.getCurrentVoterShare(),
        ]);
        return { node, voter };
    }
}

export class NetworkActionsV14<C extends VotingContracts> extends NetworkActions<C> {
    readonly voting: NetworkVotingActions<C>;
    readonly revenues: NetworkRevenueActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        super(view);
        this.voting = new NetworkVotingActions<C>(view);
        this.revenues = new NetworkRevenueActions<C>(view);
    }
}
