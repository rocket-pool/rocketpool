import type { ContractTransactionReceipt } from "ethers";

import { ethers } from "../../../../test-old/_utils/hardhat-runtime";
import type { CurrentContracts, V14Contracts } from "../contracts";
import { GuardedFacade } from "../view";

export interface RewardSubmission {
    rewardIndex: bigint;
    executionBlock: bigint;
    consensusBlock: bigint;
    merkleRoot: string;
    intervalsPassed: bigint;
    smoothingPoolETH: bigint;
    treasuryRPL: bigint;
    treasuryETH: bigint;
    userETH: bigint;
    trustedNodeRPL: bigint[];
    nodeRPL: bigint[];
    nodeETH: bigint[];
}

export interface RewardClaim {
    rewardIndex: bigint;
    amountRPL: bigint;
    amountSmoothingPoolETH: bigint;
    amountVoterETH: bigint;
    merkleProof: string[];
}

type RewardContracts = V14Contracts | CurrentContracts;

export class RewardActions<C extends RewardContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async fundSmoothingPool(from: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(from);
        await (await signer.sendTransaction({
            to: await this.contracts.rocketSmoothingPool.getAddress(),
            value: amount,
        })).wait();
        this.view.context.trace(`funded smoothing pool with ${amount} wei from ${from}`);
    }

    async depositVoterShare(from: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(from);
        await (await this.contracts.rocketRewardsPool.connect(signer).depositVoterShare({
            value: amount,
        })).wait();
        this.view.context.trace(`deposited ${amount} wei of voter share from ${from}`);
    }

    rewardIndex(): Promise<bigint> {
        this.active();
        return this.contracts.rocketRewardsPool.getRewardIndex();
    }

    pendingEth(): Promise<bigint> {
        this.active();
        return this.contracts.rocketRewardsPool.getPendingETHRewards();
    }

    async submitted(caller: string, index: bigint): Promise<boolean> {
        this.active();
        return this.contracts.rocketRewardsPool.getTrustedNodeSubmitted(
            await this.view.context.actorAddress(caller),
            index,
        );
    }

    submissionCount(submission: RewardSubmission): Promise<bigint> {
        this.active();
        return this.contracts.rocketRewardsPool.getSubmissionCount(submission);
    }

    async submissionExists(caller: string, submission: RewardSubmission): Promise<boolean> {
        this.active();
        return this.contracts.rocketRewardsPool.getSubmissionFromNodeExists(
            await this.view.context.actorAddress(caller),
            submission,
        );
    }

    async submit(
        submission: RewardSubmission,
        options: { caller: string },
    ): Promise<ContractTransactionReceipt> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        const receipt = await (await this.contracts.rocketRewardsPool.connect(signer)
            .submitRewardSnapshot(submission)).wait();
        if (!receipt) throw new Error("Reward snapshot submission was not mined");
        this.view.context.trace(`submitted reward snapshot ${submission.rewardIndex} as ${options.caller}`);
        return receipt;
    }

    async execute(
        submission: RewardSubmission,
        options: { caller: string },
    ): Promise<ContractTransactionReceipt> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        const receipt = await (await this.contracts.rocketRewardsPool.connect(signer)
            .executeRewardSnapshot(submission)).wait();
        if (!receipt) throw new Error("Reward snapshot execution was not mined");
        this.view.context.trace(`executed reward snapshot ${submission.rewardIndex} as ${options.caller}`);
        return receipt;
    }

    async execution(index: bigint): Promise<{ block: bigint; address: string }> {
        this.active();
        const [block, address] = await Promise.all([
            this.contracts.rocketRewardsPool.getClaimIntervalExecutionBlock(index),
            this.contracts.rocketRewardsPool.getClaimIntervalExecutionAddress(index),
        ]);
        return { block, address };
    }

    async claim(
        node: string,
        claims: RewardClaim[],
        options: { caller?: string } = {},
    ): Promise<ContractTransactionReceipt> {
        this.active();
        const signer = await this.view.context.actor(options.caller ?? node);
        const receipt = await (await this.contracts.rocketMerkleDistributorMainnet.connect(signer)
            .claim(await this.view.context.actorAddress(node), claims)).wait();
        if (!receipt) throw new Error("Reward claim was not mined");
        return receipt;
    }

    async claimAndStake(
        node: string,
        claims: RewardClaim[],
        stakeAmount: bigint,
        options: { caller?: string } = {},
    ): Promise<ContractTransactionReceipt> {
        this.active();
        const signer = await this.view.context.actor(options.caller ?? node);
        const receipt = await (await this.contracts.rocketMerkleDistributorMainnet.connect(signer)
            .claimAndStake(await this.view.context.actorAddress(node), claims, stakeAmount)).wait();
        if (!receipt) throw new Error("Reward claim-and-stake transaction was not mined");
        return receipt;
    }

    outstandingEth(addressOrActor: string): Promise<bigint> {
        this.active();
        const address = ethers.isAddress(addressOrActor)
            ? addressOrActor
            : this.view.context.actorAddress(addressOrActor);
        return Promise.resolve(address).then(value =>
            this.contracts.rocketMerkleDistributorMainnet.getOutstandingEth(value));
    }

    async claimedBitmap(node: string, word: bigint): Promise<bigint> {
        this.active();
        const key = ethers.solidityPackedKeccak256(
            ["string", "address", "uint256"],
            ["rewards.interval.claimed", await this.view.context.actorAddress(node), word],
        );
        return this.contracts.rocketStorage.getUint(key);
    }
}
