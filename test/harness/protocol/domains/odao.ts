import type { CurrentContracts, ProtocolContracts, V14Contracts } from "../contracts";
import type { ActiveProtocolView } from "../view";
import { GuardedFacade } from "../view";

export class ODAOMinipoolSettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async getScrubPeriod(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsMinipool.getScrubPeriod();
    }

    async getScrubPenaltyEnabled(): Promise<boolean> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsMinipool.getScrubPenaltyEnabled();
    }

    async getPromotionScrubPeriod(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsMinipool.getPromotionScrubPeriod();
    }

    async getBondReductionWindowStart(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsMinipool.getBondReductionWindowStart();
    }

    async getBondReductionWindowLength(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsMinipool.getBondReductionWindowLength();
    }

    private async setUint(path: string, value: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAONodeTrusted.connect(guardian).bootstrapSettingUint(
            "rocketDAONodeTrustedSettingsMinipool",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    private async setBoolean(path: string, value: boolean): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAONodeTrusted.connect(guardian).bootstrapSettingBool(
            "rocketDAONodeTrustedSettingsMinipool",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    setScrubPeriod(seconds: bigint): Promise<void> {
        return this.setUint("minipool.scrub.period", seconds);
    }

    setScrubPenaltyEnabled(value: boolean): Promise<void> {
        return this.setBoolean("minipool.scrub.penalty.enabled", value);
    }

    setPromotionScrubPeriod(seconds: bigint): Promise<void> {
        return this.setUint("minipool.promotion.scrub.period", seconds);
    }

    setBondReductionWindowStart(seconds: bigint): Promise<void> {
        return this.setUint("minipool.bond.reduction.window.start", seconds);
    }

    setBondReductionWindowLength(seconds: bigint): Promise<void> {
        return this.setUint("minipool.bond.reduction.window.length", seconds);
    }
}

export class ODAOSettingsActions<C extends ProtocolContracts> {
    readonly minipools: ODAOMinipoolSettingsActions<C>;
    readonly proposals: ODAOProposalSettingsActions<C>;
    readonly members: ODAOMemberSettingsActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        this.minipools = new ODAOMinipoolSettingsActions<C>(view);
        this.proposals = new ODAOProposalSettingsActions<C>(view);
        this.members = new ODAOMemberSettingsActions<C>(view);
    }
}

export class ODAOMemberSettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    private async setUint(
        path: string,
        value: bigint,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const signer = options.caller
            ? await this.view.context.actor(options.caller)
            : await this.view.context.guardian();
        await (await this.contracts.rocketDAONodeTrusted.connect(signer).bootstrapSettingUint(
            "rocketDAONodeTrustedSettingsMembers",
            path,
            value,
        )).wait();
        this.view.context.trace(`set oDAO ${path} to ${value}`);
    }

    quorum(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsMembers.getQuorum();
    }

    bond(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsMembers.getRPLBond();
    }

    challengeCooldown(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsMembers.getChallengeCooldown();
    }

    challengeWindow(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsMembers.getChallengeWindow();
    }

    challengeCost(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsMembers.getChallengeCost();
    }

    setQuorum(value: bigint, options: { caller?: string } = {}): Promise<void> {
        return this.setUint("members.quorum", value, options);
    }

    setBond(value: bigint, options: { caller?: string } = {}): Promise<void> {
        return this.setUint("members.rplbond", value, options);
    }

    setChallengeCooldown(value: bigint): Promise<void> {
        return this.setUint("members.challenge.cooldown", value);
    }

    setChallengeWindow(value: bigint): Promise<void> {
        return this.setUint("members.challenge.window", value);
    }
}

export class ODAOProposalSettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    private async setUint(
        path: string,
        value: bigint,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const signer = options.caller
            ? await this.view.context.actor(options.caller)
            : await this.view.context.guardian();
        await (await this.contracts.rocketDAONodeTrusted.connect(signer).bootstrapSettingUint(
            "rocketDAONodeTrustedSettingsProposals",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    getCooldown(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsProposals.getCooldownTime();
    }

    getVoteTime(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsProposals.getVoteTime();
    }

    getVoteDelay(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsProposals.getVoteDelayTime();
    }

    getExecuteTime(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsProposals.getExecuteTime();
    }

    getActionTime(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedSettingsProposals.getActionTime();
    }

    setCooldown(seconds: bigint, options: { caller?: string } = {}): Promise<void> {
        return this.setUint("proposal.cooldown.time", seconds, options);
    }

    setVoteTime(seconds: bigint): Promise<void> {
        return this.setUint("proposal.vote.time", seconds);
    }

    setVoteDelay(seconds: bigint): Promise<void> {
        return this.setUint("proposal.vote.delay.time", seconds);
    }
}

export class ODAOMemberActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async count(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrusted.getMemberCount();
    }

    async isValid(name: string): Promise<boolean> {
        this.active();
        return this.contracts.rocketDAONodeTrusted.getMemberIsValid(
            await this.view.context.actorAddress(name),
        );
    }

    async id(name: string): Promise<string> {
        this.active();
        return this.contracts.rocketDAONodeTrusted.getMemberID(
            await this.view.context.actorAddress(name),
        );
    }

    async bond(name: string): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrusted.getMemberRPLBondAmount(
            await this.view.context.actorAddress(name),
        );
    }

    minimumRequired(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrusted.getMemberMinRequired();
    }

    quorumVotesRequired(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrusted.getMemberQuorumVotesRequired();
    }

    async bootstrapInvite(
        name: string,
        options: { id: string; url: string; caller?: string },
    ): Promise<void> {
        this.active();
        const signer = options.caller
            ? await this.view.context.actor(options.caller)
            : await this.view.context.guardian();
        await (await this.contracts.rocketDAONodeTrusted.connect(signer).bootstrapMember(
            options.id,
            options.url,
            await this.view.context.actorAddress(name),
        )).wait();
    }

    async prepareBond(name: string): Promise<bigint> {
        this.active();
        const signer = await this.view.context.actor(name);
        const guardian = await this.view.context.guardian();
        const address = await signer.getAddress();
        const bond = await this.contracts.rocketDAONodeTrustedSettingsMembers.getRPLBond();
        await (await this.contracts.rocketTokenRPLFixedSupply.connect(guardian).mint(address, bond)).wait();
        await (await this.contracts.rocketTokenRPLFixedSupply.connect(signer).approve(
            await this.contracts.rocketTokenRPL.getAddress(), bond,
        )).wait();
        await (await this.contracts.rocketTokenRPL.connect(signer).swapTokens(bond)).wait();
        await (await this.contracts.rocketTokenRPL.connect(signer).approve(
            await this.contracts.rocketDAONodeTrustedActions.getAddress(), bond,
        )).wait();
        return bond;
    }

    async join(name: string): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketDAONodeTrustedActions.connect(signer).actionJoin()).wait();
    }

    async joinRequired(name: string, options: { id: string; url: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketDAONodeTrusted.connect(signer).memberJoinRequired(
            options.id,
            options.url,
        )).wait();
    }

    async bootstrap(
        name: string,
        options: { id: string; url: string },
    ): Promise<void> {
        this.active();
        await this.bootstrapInvite(name, options);
        await this.prepareBond(name);
        await this.join(name);
        this.view.context.trace(`bootstrapped ${name} as oDAO member ${options.id}`);
    }

    async leave(name: string, options: { refundAddress?: string } = {}): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        const refundAddress = options.refundAddress === undefined
            ? await signer.getAddress()
            : await this.view.context.actorAddress(options.refundAddress);
        await (await this.contracts.rocketDAONodeTrustedActions.connect(signer).actionLeave(
            refundAddress,
        )).wait();
        this.view.context.trace(`${name} left the oDAO`);
    }
}

export class ODAOChallengeActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async isChallenged(member: string): Promise<boolean> {
        this.active();
        return this.contracts.rocketDAONodeTrusted.getMemberIsChallenged(
            await this.view.context.actorAddress(member),
        );
    }

    async make(
        member: string,
        options: { caller: string; value?: bigint },
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAONodeTrustedActions.connect(signer).actionChallengeMake(
            await this.view.context.actorAddress(member),
            { value: options.value ?? 0n },
        )).wait();
    }

    async decide(member: string, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAONodeTrustedActions.connect(signer).actionChallengeDecide(
            await this.view.context.actorAddress(member),
        )).wait();
    }
}

export interface ODAOProposalDetails {
    state: bigint;
    start: bigint;
    end: bigint;
    expires: bigint;
    votesFor: bigint;
    votesAgainst: bigint;
    votesRequired: bigint;
}

export class ODAOProposalActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async total(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProposal.getTotal();
    }

    async propose(message: string, payload: string, options: { caller: string }): Promise<bigint> {
        this.active();
        const before = await this.total();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAONodeTrustedProposals.connect(signer).propose(
            message,
            payload,
        )).wait();
        return before + 1n;
    }

    async vote(id: bigint, support: boolean, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAONodeTrustedProposals.connect(signer).vote(
            id,
            support,
        )).wait();
    }

    async execute(id: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAONodeTrustedProposals.connect(signer).execute(id)).wait();
    }

    async cancel(id: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAONodeTrustedProposals.connect(signer).cancel(id)).wait();
    }

    async details(id: bigint): Promise<ODAOProposalDetails> {
        this.active();
        const [state, start, end, expires, votesFor, votesAgainst, votesRequired] = await Promise.all([
            this.contracts.rocketDAOProposal.getState(id),
            this.contracts.rocketDAOProposal.getStart(id),
            this.contracts.rocketDAOProposal.getEnd(id),
            this.contracts.rocketDAOProposal.getExpires(id),
            this.contracts.rocketDAOProposal.getVotesFor(id),
            this.contracts.rocketDAOProposal.getVotesAgainst(id),
            this.contracts.rocketDAOProposal.getVotesRequired(id),
        ]);
        return { state, start, end, expires, votesFor, votesAgainst, votesRequired };
    }
}

export class ODAOBootstrapActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    disabled(): Promise<boolean> {
        this.active();
        return this.contracts.rocketDAONodeTrusted.getBootstrapModeDisabled();
    }

    async disable(options: { caller?: string } = {}): Promise<void> {
        this.active();
        const signer = options.caller
            ? await this.view.context.actor(options.caller)
            : await this.view.context.guardian();
        await (await this.contracts.rocketDAONodeTrusted.connect(signer).bootstrapDisable(true)).wait();
    }

    async upgrade(
        type: string,
        name: string,
        abi: string,
        address: string,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const signer = options.caller
            ? await this.view.context.actor(options.caller)
            : await this.view.context.guardian();
        if (this.view.release === "1.3.1") {
            await (await this.contracts.rocketDAONodeTrusted.connect(signer).bootstrapUpgrade(
                type,
                name,
                abi,
                address,
            )).wait();
        } else {
            const upgrade = (this.contracts as V14Contracts | CurrentContracts)
                .rocketDAONodeTrustedUpgrade;
            await (await upgrade.connect(signer).bootstrapUpgrade(type, name, abi, address)).wait();
        }
    }
}

export class ODAOActions<C extends ProtocolContracts> {
    readonly settings: ODAOSettingsActions<C>;
    readonly members: ODAOMemberActions<C>;
    readonly proposals: ODAOProposalActions<C>;
    readonly challenges: ODAOChallengeActions<C>;
    readonly bootstrap: ODAOBootstrapActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        this.settings = new ODAOSettingsActions<C>(view);
        this.members = new ODAOMemberActions<C>(view);
        this.proposals = new ODAOProposalActions<C>(view);
        this.challenges = new ODAOChallengeActions<C>(view);
        this.bootstrap = new ODAOBootstrapActions<C>(view);
    }
}

type ODAOUpgradeContracts = V14Contracts | CurrentContracts;

export interface ODAOUpgradeDetails {
    state: bigint;
    end: bigint;
    executed: boolean;
    vetoed: boolean;
    type: string;
    name: string;
    address: string;
    abi: string;
}

export class ODAOUpgradeActions<C extends ODAOUpgradeContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    total(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedUpgrade.getTotal();
    }

    state(id: bigint): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAONodeTrustedUpgrade.getState(id);
    }

    vetoed(id: bigint): Promise<boolean> {
        this.active();
        return this.contracts.rocketDAONodeTrustedUpgrade.getVetoed(id);
    }

    async details(id: bigint): Promise<ODAOUpgradeDetails> {
        this.active();
        const upgrade = this.contracts.rocketDAONodeTrustedUpgrade;
        const [state, end, executed, vetoed, type, name, address, abi] = await Promise.all([
            upgrade.getState(id),
            upgrade.getEnd(id),
            upgrade.getExecuted(id),
            upgrade.getVetoed(id),
            upgrade.getType(id),
            upgrade.getName(id),
            upgrade.getUpgradeAddress(id),
            upgrade.getUpgradeABI(id),
        ]);
        return { state, end, executed, vetoed, type, name, address, abi };
    }

    async execute(id: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAONodeTrustedUpgrade.connect(signer).execute(id)).wait();
        this.view.context.trace(`executed oDAO upgrade ${id} as ${options.caller}`);
    }
}

export class ODAOActionsV14<C extends ODAOUpgradeContracts> extends ODAOActions<C> {
    readonly upgrades: ODAOUpgradeActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        super(view);
        this.upgrades = new ODAOUpgradeActions<C>(view);
    }
}
