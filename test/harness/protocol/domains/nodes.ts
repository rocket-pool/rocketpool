import type {
    CurrentContracts,
    ProtocolContracts,
    V131Contracts,
    V14Contracts,
} from "../contracts";
import { ethers } from "../../../../test-old/_utils/hardhat-runtime";
import { GuardedFacade } from "../view";

const ETHER = 10n ** 18n;

interface CallerOptions {
    caller?: string;
}

export class NodeActionsBase<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async address(name: string): Promise<string> {
        this.active();
        return this.view.context.actorAddress(name);
    }

    async register(
        name: string,
        options: { timezone?: string } = {},
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        const timezone = options.timezone ?? "Australia/Brisbane";
        const tx = await this.contracts.rocketNodeManager
            .connect(signer)
            .registerNode(timezone);
        await tx.wait();
        this.view.context.trace(`registered node ${name} in ${timezone}`);
    }

    async setTimezone(
        name: string,
        timezone: string,
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketNodeManager.connect(signer).setTimezoneLocation(timezone)).wait();
        this.view.context.trace(`set ${name} timezone to ${timezone}`);
    }

    async setWithdrawalAddress(
        name: string,
        withdrawalAddress: string,
        options: CallerOptions & { confirm: boolean },
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller ?? name);
        const nodeAddress = await this.address(name);
        const newWithdrawalAddress = ethers.isAddress(withdrawalAddress)
            ? withdrawalAddress
            : await this.address(withdrawalAddress);
        await (await this.contracts.rocketStorage.connect(signer).setWithdrawalAddress(
            nodeAddress,
            newWithdrawalAddress,
            options.confirm,
        )).wait();
        this.view.context.trace(
            `set ${name} withdrawal address to ${withdrawalAddress} as ${options.caller ?? name}`,
        );
    }

    async confirmWithdrawalAddress(
        name: string,
        options: { caller: string },
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketStorage.connect(signer).confirmWithdrawalAddress(
            await this.address(name),
        )).wait();
        this.view.context.trace(`confirmed ${name} withdrawal address as ${options.caller}`);
    }

    async setSmoothingPoolRegistration(
        name: string,
        state: boolean,
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketNodeManager
            .connect(signer)
            .setSmoothingPoolRegistrationState(state)).wait();
        this.view.context.trace(`set ${name} smoothing pool registration to ${state}`);
    }

    async count(): Promise<bigint> {
        this.active();
        return this.contracts.rocketNodeManager.getNodeCount();
    }

    async at(index: bigint): Promise<string> {
        this.active();
        return this.contracts.rocketNodeManager.getNodeAt(index);
    }

    async exists(name: string): Promise<boolean> {
        this.active();
        return this.contracts.rocketNodeManager.getNodeExists(await this.address(name));
    }

    async timezone(name: string): Promise<string> {
        this.active();
        return this.contracts.rocketNodeManager.getNodeTimezoneLocation(await this.address(name));
    }

    async withdrawalAddress(name: string): Promise<string> {
        this.active();
        return this.contracts.rocketStorage.getNodeWithdrawalAddress(await this.address(name));
    }

    async pendingWithdrawalAddress(name: string): Promise<string> {
        this.active();
        return this.contracts.rocketStorage.getNodePendingWithdrawalAddress(await this.address(name));
    }

    async withdrawalBalance(name: string): Promise<bigint> {
        this.active();
        return ethers.provider.getBalance(await this.withdrawalAddress(name));
    }

    async depositCredit(name: string): Promise<bigint> {
        this.active();
        return this.contracts.rocketNodeDeposit.getNodeDepositCredit(
            await this.address(name),
        );
    }

    async activeMinipoolCount(name: string): Promise<bigint> {
        this.active();
        return this.contracts.rocketMinipoolManager.getNodeActiveMinipoolCount(
            await this.address(name),
        );
    }

    async stakingMinipoolCountByBond(name: string, bond: bigint): Promise<bigint> {
        this.active();
        return this.contracts.rocketMinipoolManager.getNodeStakingMinipoolCountBySize(
            await this.address(name),
            bond,
        );
    }

    async smoothingPoolRegistration(name: string): Promise<boolean> {
        this.active();
        return this.contracts.rocketNodeManager.getSmoothingPoolRegistrationState(
            await this.address(name),
        );
    }

    async stakeRpl(name: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketTokenRPL.connect(signer).approve(
            await this.contracts.rocketNodeStaking.getAddress(),
            amount,
        )).wait();
        await (await this.contracts.rocketNodeStaking.connect(signer).stakeRPL(amount)).wait();
        this.view.context.trace(`staked ${amount} RPL for ${name}`);
    }

    async countByTimezone(): Promise<Array<{ timezone: string; count: bigint }>> {
        this.active();
        const counts = await this.contracts.rocketNodeManager.getNodeCountPerTimezone(0n, 0n);
        return counts.map(count => ({ timezone: count.timezone, count: count.count }));
    }
}

export class NodeActions131 extends NodeActionsBase<V131Contracts> {
    async averageFee(name: string): Promise<bigint> {
        this.active();
        const contracts = this.view.contracts as V131Contracts;
        return contracts.rocketNodeManager.getAverageNodeFee(await this.address(name));
    }

    async stakedRpl(name: string): Promise<bigint> {
        this.active();
        const contracts = this.view.contracts as V131Contracts;
        return contracts.rocketNodeStaking.getNodeRPLStake(await this.address(name));
    }

    async borrowedEth(name: string): Promise<bigint> {
        this.active();
        const contracts = this.view.contracts as V131Contracts;
        return contracts.rocketNodeStaking.getNodeETHMatched(await this.address(name));
    }

    async stakeMinimumRpl(
        name: string,
        options: { minipools: number; bond: bigint },
    ): Promise<bigint> {
        this.active();
        if (options.minipools <= 0) throw new Error("minipools must be positive");
        if (options.bond !== 8n * ETHER && options.bond !== 16n * ETHER) {
            throw new Error("Historical minipool bond must be 8 or 16 ETH");
        }

        const contracts = this.view.contracts as V131Contracts;
        const [minimumStake, rplPrice] = await Promise.all([
            contracts.rocketDAOProtocolSettingsNode.getMinimumPerMinipoolStake(),
            contracts.rocketNetworkPrices.getRPLPrice(),
        ]);
        const borrowedEth = 32n * ETHER - options.bond;
        const amount = borrowedEth * minimumStake / rplPrice * BigInt(options.minipools);
        const signer = await this.view.context.actor(name);
        const guardian = await this.view.context.guardian();
        const signerAddress = await signer.getAddress();

        await (await contracts.rocketTokenRPLFixedSupply.connect(guardian).mint(signerAddress, amount)).wait();
        await (await contracts.rocketTokenRPLFixedSupply.connect(signer).approve(
            await contracts.rocketTokenRPL.getAddress(),
            amount,
        )).wait();
        await (await contracts.rocketTokenRPL.connect(signer).swapTokens(amount)).wait();
        await (await contracts.rocketTokenRPL.connect(signer).approve(
            await contracts.rocketNodeStaking.getAddress(),
            amount,
        )).wait();
        await (await contracts.rocketNodeStaking.connect(signer).stakeRPL(amount)).wait();
        this.view.context.trace(`staked ${amount} RPL for ${name}`);
        return amount;
    }
}

export class NodeActionsV14<C extends V14Contracts | CurrentContracts> extends NodeActionsBase<C> {
    private get rewardContracts(): C {
        return this.view.contracts as C;
    }

    async stakedRpl(name: string): Promise<bigint> {
        this.active();
        return this.rewardContracts.rocketNodeStaking.getNodeStakedRPL(await this.address(name));
    }

    async borrowedEth(name: string): Promise<bigint> {
        this.active();
        return this.rewardContracts.rocketNodeStaking.getNodeETHBorrowed(await this.address(name));
    }

    async legacyStakedRpl(name: string): Promise<bigint> {
        this.active();
        return this.rewardContracts.rocketNodeStaking.getNodeLegacyStakedRPL(await this.address(name));
    }

    async megapoolStakedRpl(name: string): Promise<bigint> {
        this.active();
        return this.rewardContracts.rocketNodeStaking.getNodeMegapoolStakedRPL(await this.address(name));
    }

    async minimumLegacyRplStake(name: string): Promise<bigint> {
        this.active();
        return this.rewardContracts.rocketNodeStaking.getNodeMinimumLegacyRPLStake(await this.address(name));
    }

    async rplWithdrawalAddress(name: string): Promise<string> {
        this.active();
        return this.rewardContracts.rocketNodeManager.getNodeRPLWithdrawalAddress(await this.address(name));
    }

    async rplWithdrawalAddressIsSet(name: string): Promise<boolean> {
        this.active();
        return this.rewardContracts.rocketNodeManager.getNodeRPLWithdrawalAddressIsSet(await this.address(name));
    }

    async setRplWithdrawalAddress(
        name: string,
        withdrawalAddress: string,
        options: { caller?: string; confirm?: boolean } = {},
    ): Promise<void> {
        this.active();
        const caller = options.caller ?? name;
        const signer = await this.view.context.actor(caller);
        const newAddress = ethers.isAddress(withdrawalAddress)
            ? withdrawalAddress
            : await this.address(withdrawalAddress);
        await (await this.rewardContracts.rocketNodeManager.connect(signer).setRPLWithdrawalAddress(
            await this.address(name),
            newAddress,
            options.confirm ?? true,
        )).wait();
        this.view.context.trace(`set ${name} RPL withdrawal address to ${withdrawalAddress} as ${caller}`);
    }

    async setStakeRplForAllowed(
        name: string,
        caller: string,
        allowed: boolean,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const actor = options.caller ?? name;
        const signer = await this.view.context.actor(actor);
        await (await this.rewardContracts.rocketNodeStaking.connect(signer)[
            "setStakeRPLForAllowed(address,address,bool)"
        ](
            await this.address(name),
            await this.address(caller),
            allowed,
        )).wait();
        this.view.context.trace(`set stake-for permission for ${caller} on ${name} to ${allowed} as ${actor}`);
    }

    async setRplLockingAllowed(
        name: string,
        allowed: boolean,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const actor = options.caller ?? name;
        const signer = await this.view.context.actor(actor);
        await (await this.rewardContracts.rocketNodeStaking.connect(signer).setRPLLockingAllowed(
            await this.address(name),
            allowed,
        )).wait();
        this.view.context.trace(`set RPL locking permission for ${name} to ${allowed} as ${actor}`);
    }

    async stakeRplFor(name: string, amount: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.rewardContracts.rocketTokenRPL.connect(signer).approve(
            await this.rewardContracts.rocketNodeStaking.getAddress(),
            amount,
        )).wait();
        await (await this.rewardContracts.rocketNodeStaking.connect(signer).stakeRPLFor(
            await this.address(name),
            amount,
        )).wait();
        this.view.context.trace(`staked ${amount} RPL for ${name} as ${options.caller}`);
    }

    async unstakeRpl(
        name: string,
        amount: bigint,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const actor = options.caller ?? name;
        const signer = await this.view.context.actor(actor);
        await (await this.rewardContracts.rocketNodeStaking.connect(signer).unstakeRPLFor(
            await this.address(name),
            amount,
        )).wait();
        this.view.context.trace(`unstaked ${amount} megapool RPL for ${name} as ${actor}`);
    }

    async unstakeLegacyRpl(
        name: string,
        amount: bigint,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const actor = options.caller ?? name;
        const signer = await this.view.context.actor(actor);
        await (await this.rewardContracts.rocketNodeStaking.connect(signer).unstakeLegacyRPLFor(
            await this.address(name),
            amount,
        )).wait();
        this.view.context.trace(`unstaked ${amount} legacy RPL for ${name} as ${actor}`);
    }

    async withdrawRpl(name: string, options: { caller?: string } = {}): Promise<void> {
        this.active();
        const actor = options.caller ?? name;
        const signer = await this.view.context.actor(actor);
        await (await this.rewardContracts.rocketNodeStaking.connect(signer).withdrawRPLFor(
            await this.address(name),
        )).wait();
        this.view.context.trace(`withdrew unstaking RPL for ${name} as ${actor}`);
    }

    async unstakingRpl(name: string): Promise<bigint> {
        this.active();
        return this.rewardContracts.rocketNodeStaking.getNodeUnstakingRPL(await this.address(name));
    }

    async lockedRpl(name: string): Promise<bigint> {
        this.active();
        return this.rewardContracts.rocketNodeStaking.getNodeLockedRPL(await this.address(name));
    }

    async expressTicketCount(name: string): Promise<bigint> {
        this.active();
        return this.rewardContracts.rocketNodeManager.getExpressTicketCount(await this.address(name));
    }

    async expressTicketsProvisioned(name: string): Promise<boolean> {
        this.active();
        return this.rewardContracts.rocketNodeManager.getExpressTicketsProvisioned(await this.address(name));
    }

    async provisionExpressTickets(name: string): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.rewardContracts.rocketNodeManager.connect(signer).provisionExpressTickets(
            await signer.getAddress(),
        )).wait();
    }

    async initialiseFeeDistributor(name: string): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.rewardContracts.rocketNodeManager
            .connect(signer)
            .initialiseFeeDistributor()).wait();
        this.view.context.trace(`initialised fee distributor for ${name}`);
    }

    async averageFee(name: string): Promise<bigint> {
        this.active();
        return this.rewardContracts.rocketNodeManager.getAverageNodeFee(await this.address(name));
    }

    async unclaimedRewards(name: string): Promise<bigint> {
        this.active();
        return this.rewardContracts.rocketNodeManager.getUnclaimedRewards(await this.address(name));
    }

    async addUnclaimedRewards(
        name: string,
        amount: bigint,
        options: CallerOptions = {},
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller ?? name);
        await (await this.rewardContracts.rocketNodeManager
            .connect(signer)
            .addUnclaimedRewards(await this.address(name), { value: amount })).wait();
        this.view.context.trace(`added ${amount} wei of unclaimed rewards for ${name}`);
    }

    async claimUnclaimedRewards(
        name: string,
        options: CallerOptions = {},
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller ?? name);
        await (await this.rewardContracts.rocketNodeManager
            .connect(signer)
            .claimUnclaimedRewards(await this.address(name))).wait();
        this.view.context.trace(`claimed unclaimed rewards for ${name} as ${options.caller ?? name}`);
    }
}
