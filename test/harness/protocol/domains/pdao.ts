import type { CurrentContracts, ProtocolContracts, V14Contracts } from "../contracts";
import type { ActiveProtocolView } from "../view";
import { GuardedFacade } from "../view";
import { PDAOSecurityActions, PDAOSecurityActionsV14 } from "./pdao-security";
import {
    PDAOBootstrapActions,
    PDAOGovernanceActions,
    type PDAOGovernanceContracts,
} from "./pdao-governance";

export interface TreasuryPaymentDetails {
    recipient: string;
    amountPerPeriod: bigint;
    periodLength: bigint;
    lastPaymentTime: bigint;
    numPeriods: bigint;
    periodsPaid: bigint;
}

export interface CreateRecurringPaymentOptions {
    recipient: string;
    amountPerPeriod: bigint;
    periodLength: bigint;
    startTime: bigint;
    numPeriods: bigint;
}

export type UpdateRecurringPaymentOptions = Omit<CreateRecurringPaymentOptions, "startTime">;

export class PDAOTreasuryActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async createRecurringPayment(
        name: string,
        options: CreateRecurringPaymentOptions,
    ): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        const recipient = await this.view.context.actorAddress(options.recipient);
        await (await this.contracts.rocketDAOProtocol.connect(guardian)
            .bootstrapTreasuryNewContract(
                name,
                recipient,
                options.amountPerPeriod,
                options.periodLength,
                options.startTime,
                options.numPeriods,
            )).wait();
        this.view.context.trace(`created recurring treasury payment ${name}`);
    }

    async updateRecurringPayment(
        name: string,
        options: UpdateRecurringPaymentOptions,
    ): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        const recipient = await this.view.context.actorAddress(options.recipient);
        await (await this.contracts.rocketDAOProtocol.connect(guardian)
            .bootstrapTreasuryUpdateContract(
                name,
                recipient,
                options.amountPerPeriod,
                options.periodLength,
                options.numPeriods,
            )).wait();
        this.view.context.trace(`updated recurring treasury payment ${name}`);
    }

    async payment(name: string): Promise<TreasuryPaymentDetails> {
        this.active();
        const payment = await this.contracts.rocketClaimDAO.getContract(name);
        return {
            recipient: payment.recipient,
            amountPerPeriod: payment.amountPerPeriod,
            periodLength: payment.periodLength,
            lastPaymentTime: payment.lastPaymentTime,
            numPeriods: payment.numPeriods,
            periodsPaid: payment.periodsPaid,
        };
    }

    async recipientBalance(recipient: string): Promise<bigint> {
        this.active();
        return this.contracts.rocketClaimDAO.getBalance(
            await this.view.context.actorAddress(recipient),
        );
    }

    async treasuryBalance(): Promise<bigint> {
        this.active();
        return this.contracts.rocketVault.balanceOfToken(
            "rocketClaimDAO",
            await this.contracts.rocketTokenRPL.getAddress(),
        );
    }

    async fund(from: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(from);
        const vaultAddress = await this.contracts.rocketVault.getAddress();
        await (await this.contracts.rocketTokenRPL.connect(signer).approve(
            vaultAddress,
            amount,
        )).wait();
        await (await this.contracts.rocketVault.connect(signer).depositToken(
            "rocketClaimDAO",
            await this.contracts.rocketTokenRPL.getAddress(),
            amount,
        )).wait();
        this.view.context.trace(`funded pDAO treasury with ${amount} RPL from ${from}`);
    }

    async payOut(names: string[], options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketClaimDAO.connect(signer).payOutContracts(names)).wait();
        this.view.context.trace(`paid out treasury contracts ${names.join(", ")}`);
    }

    async withdraw(recipient: string, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        const recipientAddress = await this.view.context.actorAddress(recipient);
        await (await this.contracts.rocketClaimDAO.connect(signer)
            .withdrawBalance(recipientAddress)).wait();
        this.view.context.trace(`withdrew pDAO treasury balance for ${recipient}`);
    }
}

export class PDAONodeSettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    private async setBoolean(path: string, value: boolean): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingBool(
            "rocketDAOProtocolSettingsNode",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    setRegistrationEnabled(value: boolean): Promise<void> {
        return this.setBoolean("node.registration.enabled", value);
    }

    setDepositEnabled(value: boolean): Promise<void> {
        return this.setBoolean("node.deposit.enabled", value);
    }

    async setMinimumLegacyRplStake(value: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingUint(
            "rocketDAOProtocolSettingsNode",
            "node.minimum.legacy.staked.rpl",
            value,
        )).wait();
    }

    async setMinimumRplStakePerMinipool(value: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingUint(
            "rocketDAOProtocolSettingsNode",
            "node.per.minipool.stake.minimum",
            value,
        )).wait();
        this.view.context.trace(`set historical minimum RPL stake per minipool to ${value}`);
    }

    async setWithdrawalCooldown(seconds: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingUint(
            "rocketDAOProtocolSettingsNode",
            "node.withdrawal.cooldown",
            seconds,
        )).wait();
        this.view.context.trace(`set RPL withdrawal cooldown to ${seconds}s`);
    }

    setSmoothingPoolRegistrationEnabled(value: boolean): Promise<void> {
        return this.setBoolean("node.smoothing.pool.registration.enabled", value);
    }

    async setReducedBond(value: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingUint(
            "rocketDAOProtocolSettingsNode",
            "reduced.bond",
            value,
        )).wait();
        this.view.context.trace(`set reduced bond to ${value}`);
    }
}

export class PDAORewardsSettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async setClaimInterval(
        seconds: bigint,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const signer = options.caller
            ? await this.view.context.actor(options.caller)
            : await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(signer).bootstrapSettingUint(
            "rocketDAOProtocolSettingsRewards",
            "rpl.rewards.claim.period.time",
            seconds,
        )).wait();
        this.view.context.trace(`set rewards claim interval to ${seconds}s`);
    }

    claimInterval(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolSettingsRewards.getRewardsClaimIntervalTime();
    }

    async setClaimers(
        claimers: { trustedNode: bigint; protocol: bigint; node: bigint },
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const signer = options.caller
            ? await this.view.context.actor(options.caller)
            : await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(signer).bootstrapSettingClaimers(
            claimers.trustedNode,
            claimers.protocol,
            claimers.node,
        )).wait();
        this.view.context.trace(`set reward claimer percentages as ${options.caller ?? "guardian"}`);
    }

    async claimers(): Promise<{ trustedNode: bigint; protocol: bigint; node: bigint }> {
        this.active();
        const values = await this.contracts.rocketDAOProtocolSettingsRewards.getRewardsClaimersPerc();
        return { trustedNode: values[0], protocol: values[1], node: values[2] };
    }
}

export class PDAORewardsSettingsActionsCurrent extends PDAORewardsSettingsActions<CurrentContracts> {
    private get currentContracts(): CurrentContracts {
        return this.view.contracts as CurrentContracts;
    }

    override async setClaimInterval(
        seconds: bigint,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const frequency = await this.currentContracts.rocketDAOProtocolSettingsNetwork
            .getSubmitBalancesFrequency();
        if (seconds % frequency !== 0n) {
            throw new Error(`Reward claim interval ${seconds}s must be divisible by ${frequency}s`);
        }
        const signer = options.caller
            ? await this.view.context.actor(options.caller)
            : await this.view.context.guardian();
        await (await this.currentContracts.rocketDAOProtocol.connect(signer).bootstrapSettingUint(
            "rocketDAOProtocolSettingsRewards",
            "rewards.claimsperiods",
            seconds / frequency,
        )).wait();
        this.view.context.trace(`set rewards claim interval to ${seconds}s`);
    }
}

interface InflationSettingOptions {
    caller?: string;
}

export class PDAOInflationSettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private async setUint(
        path: string,
        value: bigint,
        options: InflationSettingOptions = {},
    ): Promise<void> {
        this.active();
        const contracts = this.view.contracts as C;
        const signer = options.caller
            ? await this.view.context.actor(options.caller)
            : await this.view.context.guardian();
        await (await contracts.rocketDAOProtocol.connect(signer).bootstrapSettingUint(
            "rocketDAOProtocolSettingsInflation",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value} as ${options.caller ?? "guardian"}`);
    }

    setStartTime(
        timestamp: bigint,
        options: InflationSettingOptions = {},
    ): Promise<void> {
        return this.setUint("rpl.inflation.interval.start", timestamp, options);
    }

    setIntervalRate(
        rate: bigint,
        options: InflationSettingOptions = {},
    ): Promise<void> {
        return this.setUint("rpl.inflation.interval.rate", rate, options);
    }
}

export class PDAOMinipoolSettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private async setUint(path: string, value: bigint): Promise<void> {
        this.active();
        const contracts = this.view.contracts as C;
        const guardian = await this.view.context.guardian();
        await (await contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingUint(
            "rocketDAOProtocolSettingsMinipool",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    setLaunchTimeout(seconds: bigint): Promise<void> {
        return this.setUint("minipool.launch.timeout", seconds);
    }

    launchTimeout(): Promise<bigint> {
        this.active();
        const contracts = this.view.contracts as C;
        return contracts.rocketDAOProtocolSettingsMinipool.getLaunchTimeout();
    }

    setMaximumCount(count: bigint): Promise<void> {
        return this.setUint("minipool.maximum.count", count);
    }

    setWithdrawalDelay(seconds: bigint): Promise<void> {
        return this.setUint("minipool.withdrawal.delay", seconds);
    }

    setUserDistributeWindowStart(seconds: bigint): Promise<void> {
        return this.setUint("minipool.user.distribute.window.start", seconds);
    }

    setUserDistributeWindowLength(seconds: bigint): Promise<void> {
        return this.setUint("minipool.user.distribute.window.length", seconds);
    }
}

export class PDAONetworkSettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private async setUint(path: string, value: bigint): Promise<void> {
        this.active();
        const contracts = this.view.contracts as C;
        const guardian = await this.view.context.guardian();
        await (await contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingUint(
            "rocketDAOProtocolSettingsNetwork",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    private async setBoolean(path: string, value: boolean): Promise<void> {
        this.active();
        const contracts = this.view.contracts as C;
        const guardian = await this.view.context.guardian();
        await (await contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingBool(
            "rocketDAOProtocolSettingsNetwork",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    setRethCollateralTarget(value: bigint): Promise<void> {
        return this.setUint("network.reth.collateral.target", value);
    }

    async setNodeFeeRange(options: {
        minimum: bigint;
        target: bigint;
        maximum: bigint;
    }): Promise<void> {
        await this.setUint("network.node.fee.minimum", options.minimum);
        await this.setUint("network.node.fee.target", options.target);
        await this.setUint("network.node.fee.maximum", options.maximum);
    }

    setSubmitPricesEnabled(value: boolean): Promise<void> {
        return this.setBoolean("network.submit.prices.enabled", value);
    }

    setSubmitBalancesEnabled(value: boolean): Promise<void> {
        return this.setBoolean("network.submit.balances.enabled", value);
    }

    setSubmitBalancesFrequency(seconds: bigint): Promise<void> {
        return this.setUint("network.submit.balances.frequency", seconds);
    }

    setProtocolDAOShare(value: bigint): Promise<void> {
        return this.setUint("network.pdao.share", value);
    }

}

type PDAOUpgradeContracts = V14Contracts | CurrentContracts;

export class PDAOMegapoolSettingsActions<C extends PDAOUpgradeContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async setDissolvePenalty(value: bigint): Promise<void> {
        return this.setUint("megapool.dissolve.penalty", value);
    }

    async setUint(path: string, value: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingUint(
            "rocketDAOProtocolSettingsMegapool",
            path,
            value,
        )).wait();
        this.view.context.trace(`set megapool setting ${path} to ${value}`);
    }

    getDissolvePenalty(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolSettingsMegapool.getDissolvePenalty();
    }

    getTimeBeforeDissolve(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolSettingsMegapool.getTimeBeforeDissolve();
    }

    getUserDistributeDelay(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolSettingsMegapool.getUserDistributeDelay();
    }

    getUserDistributeDelayWithShortfall(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolSettingsMegapool.getUserDistributeDelayWithShortfall();
    }
}

export class PDAONetworkSettingsActionsV14<C extends PDAOUpgradeContracts>
    extends PDAONetworkSettingsActions<C> {
    async effectiveShares(): Promise<{ node: bigint; voter: bigint }> {
        this.active();
        const contracts = this.view.contracts as C;
        const [node, voter] = await Promise.all([
            contracts.rocketDAOProtocolSettingsNetwork.getEffectiveNodeShare(),
            contracts.rocketDAOProtocolSettingsNetwork.getEffectiveVoterShare(),
        ]);
        return { node, voter };
    }

    allowListedControllers(): Promise<string[]> {
        this.active();
        return (this.view.contracts as C).rocketDAOProtocolSettingsNetwork.getAllowListedControllers();
    }

    maximumSecurityCouncilAdder(): Promise<bigint> {
        this.active();
        return (this.view.contracts as C).rocketDAOProtocolSettingsNetwork.getMaxNodeShareSecurityCouncilAdder();
    }

    nodeShareSecurityCouncilAdder(): Promise<bigint> {
        this.active();
        return (this.view.contracts as C).rocketDAOProtocolSettingsNetwork.getNodeShareSecurityCouncilAdder();
    }

    nodeShare(): Promise<bigint> {
        this.active();
        return (this.view.contracts as C).rocketDAOProtocolSettingsNetwork.getNodeShare();
    }

    voterShare(): Promise<bigint> {
        this.active();
        return (this.view.contracts as C).rocketDAOProtocolSettingsNetwork.getVoterShare();
    }

    async setNodeShareSecurityCouncilAdder(value: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await (this.view.contracts as C).rocketDAOProtocolSettingsNetwork.connect(signer)
            .setNodeShareSecurityCouncilAdder(value)).wait();
    }

    async setNodeShare(value: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await (this.view.contracts as C).rocketDAOProtocolSettingsNetwork.connect(signer)
            .setNodeCommissionShare(value)).wait();
    }

    async setVoterShare(value: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await (this.view.contracts as C).rocketDAOProtocolSettingsNetwork.connect(signer)
            .setVoterShare(value)).wait();
    }
}

export class PDAOProposalSettingsActions<C extends PDAOGovernanceContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    depthPerRound(): Promise<bigint> { this.active(); return this.contracts.rocketDAOProtocolVerifier.getDepthPerRound(); }
    challengeBond(): Promise<bigint> { this.active(); return this.contracts.rocketDAOProtocolSettingsProposals.getChallengeBond(); }
    proposalBond(): Promise<bigint> { this.active(); return this.contracts.rocketDAOProtocolSettingsProposals.getProposalBond(); }
    challengePeriod(): Promise<bigint> { this.active(); return this.contracts.rocketDAOProtocolSettingsProposals.getChallengePeriod(); }
    voteDelay(): Promise<bigint> { this.active(); return this.contracts.rocketDAOProtocolSettingsProposals.getVoteDelayTime(); }
    phase1Time(): Promise<bigint> { this.active(); return this.contracts.rocketDAOProtocolSettingsProposals.getVotePhase1Time(); }
    phase2Time(): Promise<bigint> { this.active(); return this.contracts.rocketDAOProtocolSettingsProposals.getVotePhase2Time(); }
    quorum(): Promise<bigint> { this.active(); return this.contracts.rocketDAOProtocolSettingsProposals.getProposalQuorum(); }
}

export class PDAODepositSettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    private async setUint(path: string, value: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingUint(
            "rocketDAOProtocolSettingsDeposit",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    private async setBoolean(path: string, value: boolean): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingBool(
            "rocketDAOProtocolSettingsDeposit",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    setEnabled(value: boolean): Promise<void> {
        return this.setBoolean("deposit.enabled", value);
    }

    setMaximumPoolSize(value: bigint): Promise<void> {
        return this.setUint("deposit.pool.maximum", value);
    }

    setAssignmentsEnabled(value: boolean): Promise<void> {
        return this.setBoolean("deposit.assign.enabled", value);
    }

    setMaximumAssignments(value: bigint): Promise<void> {
        return this.setUint("deposit.assign.maximum", value);
    }

    setMaximumSocialisedAssignments(value: bigint): Promise<void> {
        return this.setUint("deposit.assign.socialised.maximum", value);
    }

    setFee(value: bigint): Promise<void> {
        return this.setUint("deposit.fee", value);
    }

    enabled(): Promise<boolean> {
        this.active();
        return this.contracts.rocketDAOProtocolSettingsDeposit.getDepositEnabled();
    }
}

export class PDAOSecuritySettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    leaveTime(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolSettingsSecurity.getLeaveTime();
    }
}

export class PDAOSecuritySettingsActionsV14<C extends PDAOUpgradeContracts>
    extends PDAOSecuritySettingsActions<C> {
    private get upgradeContracts(): C {
        return this.view.contracts as C;
    }

    async setUpgradeDelay(seconds: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.upgradeContracts.rocketDAOProtocol.connect(guardian).bootstrapSettingUint(
            "rocketDAOProtocolSettingsSecurity",
            "upgrade.delay",
            seconds,
        )).wait();
        this.view.context.trace(`set security upgrade delay to ${seconds}s`);
    }

    upgradeDelay(): Promise<bigint> {
        this.active();
        return this.upgradeContracts.rocketDAOProtocolSettingsSecurity.getUpgradeDelay();
    }
}

export class PDAOAuctionSettingsActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    private async setUint(path: string, value: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingUint(
            "rocketDAOProtocolSettingsAuction",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    private async setBoolean(path: string, value: boolean): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        await (await this.contracts.rocketDAOProtocol.connect(guardian).bootstrapSettingBool(
            "rocketDAOProtocolSettingsAuction",
            path,
            value,
        )).wait();
        this.view.context.trace(`set ${path} to ${value}`);
    }

    setLotDuration(blocks: bigint): Promise<void> {
        return this.setUint("auction.lot.duration", blocks);
    }

    setStartingPriceRatio(value: bigint): Promise<void> {
        return this.setUint("auction.price.start", value);
    }

    setReservePriceRatio(value: bigint): Promise<void> {
        return this.setUint("auction.price.reserve", value);
    }

    setLotCreationEnabled(value: boolean): Promise<void> {
        return this.setBoolean("auction.lot.create.enabled", value);
    }

    setBiddingEnabled(value: boolean): Promise<void> {
        return this.setBoolean("auction.lot.bidding.enabled", value);
    }
}

export class PDAOSettingsActions<C extends ProtocolContracts> {
    readonly nodes: PDAONodeSettingsActions<C>;
    readonly rewards: PDAORewardsSettingsActions<C>;
    readonly inflation: PDAOInflationSettingsActions<C>;
    readonly minipools: PDAOMinipoolSettingsActions<C>;
    readonly network: PDAONetworkSettingsActions<C>;
    readonly deposits: PDAODepositSettingsActions<C>;
    readonly auctions: PDAOAuctionSettingsActions<C>;
    readonly security: PDAOSecuritySettingsActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        this.nodes = new PDAONodeSettingsActions<C>(view);
        this.rewards = new PDAORewardsSettingsActions<C>(view);
        this.inflation = new PDAOInflationSettingsActions<C>(view);
        this.minipools = new PDAOMinipoolSettingsActions<C>(view);
        this.network = new PDAONetworkSettingsActions<C>(view);
        this.deposits = new PDAODepositSettingsActions<C>(view);
        this.auctions = new PDAOAuctionSettingsActions<C>(view);
        this.security = new PDAOSecuritySettingsActions<C>(view);
    }
}

export class PDAOSettingsActionsV14<C extends PDAOUpgradeContracts>
    extends PDAOSettingsActions<C> {
    override readonly network: PDAONetworkSettingsActionsV14<C>;
    override readonly security: PDAOSecuritySettingsActionsV14<C>;
    readonly megapools: PDAOMegapoolSettingsActions<C>;
    readonly proposals: PDAOProposalSettingsActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        super(view);
        this.network = new PDAONetworkSettingsActionsV14<C>(view);
        this.security = new PDAOSecuritySettingsActionsV14<C>(view);
        this.megapools = new PDAOMegapoolSettingsActions<C>(view);
        this.proposals = new PDAOProposalSettingsActions<C>(view);
    }
}

export class PDAOSettingsActionsCurrent extends PDAOSettingsActionsV14<CurrentContracts> {
    override readonly rewards: PDAORewardsSettingsActionsCurrent;

    constructor(view: ActiveProtocolView<any, any>) {
        super(view);
        this.rewards = new PDAORewardsSettingsActionsCurrent(view);
    }
}

export class PDAOActions<C extends ProtocolContracts> {
    readonly settings: PDAOSettingsActions<C>;
    readonly treasury: PDAOTreasuryActions<C>;
    readonly security: PDAOSecurityActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        this.settings = new PDAOSettingsActions<C>(view);
        this.treasury = new PDAOTreasuryActions<C>(view);
        this.security = new PDAOSecurityActions<C>(view);
    }
}

export class PDAOActionsV14<C extends PDAOUpgradeContracts> extends PDAOActions<C> {
    override readonly settings: PDAOSettingsActionsV14<C>;
    override readonly security: PDAOSecurityActionsV14<C>;
    readonly bootstrap: PDAOBootstrapActions<C>;
    readonly governance: PDAOGovernanceActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        super(view);
        this.settings = new PDAOSettingsActionsV14<C>(view);
        this.security = new PDAOSecurityActionsV14<C>(view);
        this.bootstrap = new PDAOBootstrapActions<C>(view);
        this.governance = new PDAOGovernanceActions<C>(view);
    }
}

export class PDAOActionsCurrent extends PDAOActionsV14<CurrentContracts> {
    override readonly settings: PDAOSettingsActionsCurrent;

    constructor(view: ActiveProtocolView<any, any>) {
        super(view);
        this.settings = new PDAOSettingsActionsCurrent(view);
    }
}
