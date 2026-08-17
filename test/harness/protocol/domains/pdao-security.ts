import type {
    CurrentContracts,
    ProtocolContracts,
    V14Contracts,
} from "../contracts";
import type { ActiveProtocolView } from "../view";
import { GuardedFacade } from "../view";

export interface SecurityProposalDetails {
    state: bigint;
    start: bigint;
    end: bigint;
    votesFor: bigint;
    votesRequired: bigint;
}

export class PDAOSecurityMemberActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    count(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOSecurity.getMemberCount();
    }

    async isMember(name: string): Promise<boolean> {
        this.active();
        return this.contracts.rocketDAOSecurity.getMemberIsValid(
            await this.view.context.actorAddress(name),
        );
    }

    async invite(name: string, options: { id: string }): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSecurityInvite(
            options.id,
            await this.view.context.actorAddress(name),
        )).wait();
        this.view.context.trace(`invited ${name} to the security council as ${options.id}`);
    }

    async join(name: string): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketDAOSecurityActions.connect(signer).actionJoin()).wait();
        this.view.context.trace(`${name} joined the security council`);
    }

    async requestLeave(name: string): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketDAOSecurityActions.connect(signer)
            .actionRequestLeave()).wait();
        this.view.context.trace(`${name} requested to leave the security council`);
    }

    async leave(name: string): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketDAOSecurityActions.connect(signer).actionLeave()).wait();
        this.view.context.trace(`${name} left the security council`);
    }
}

export class PDAOSecurityProposalActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    total(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProposal.getTotal();
    }

    async propose(
        message: string,
        payload: string,
        options: { caller: string },
    ): Promise<bigint> {
        this.active();
        const before = await this.total();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOSecurityProposals.connect(signer).propose(
            message,
            payload,
        )).wait();
        return before + 1n;
    }

    async vote(id: bigint, support: boolean, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOSecurityProposals.connect(signer).vote(
            id,
            support,
        )).wait();
    }

    async execute(id: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOSecurityProposals.connect(signer).execute(id)).wait();
    }

    async details(id: bigint): Promise<SecurityProposalDetails> {
        this.active();
        const [state, start, end, votesFor, votesRequired] = await Promise.all([
            this.contracts.rocketDAOProposal.getState(id),
            this.contracts.rocketDAOProposal.getStart(id),
            this.contracts.rocketDAOProposal.getEnd(id),
            this.contracts.rocketDAOProposal.getVotesFor(id),
            this.contracts.rocketDAOProposal.getVotesRequired(id),
        ]);
        return { state, start, end, votesFor, votesRequired };
    }
}

type SecurityUpgradeContracts = V14Contracts | CurrentContracts;

export class PDAOSecurityUpgradeActions<C extends SecurityUpgradeContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async proposeVeto(
        message: string,
        upgradeId: bigint,
        options: { caller: string },
    ): Promise<bigint> {
        this.active();
        const before = await this.contracts.rocketDAOProposal.getTotal();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOSecurityUpgrade.connect(signer).proposeVeto(
            message,
            upgradeId,
        )).wait();
        return before + 1n;
    }

    async vote(id: bigint, support: boolean, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOSecurityUpgrade.connect(signer).vote(
            id,
            support,
        )).wait();
    }

    async execute(id: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOSecurityUpgrade.connect(signer).execute(id)).wait();
    }
}

export class PDAOSecurityActions<C extends ProtocolContracts> {
    readonly members: PDAOSecurityMemberActions<C>;
    readonly proposals: PDAOSecurityProposalActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        this.members = new PDAOSecurityMemberActions<C>(view);
        this.proposals = new PDAOSecurityProposalActions<C>(view);
    }
}

export class PDAOSecurityActionsV14<C extends SecurityUpgradeContracts>
    extends PDAOSecurityActions<C> {
    readonly upgrades: PDAOSecurityUpgradeActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        super(view);
        this.upgrades = new PDAOSecurityUpgradeActions<C>(view);
    }
}
