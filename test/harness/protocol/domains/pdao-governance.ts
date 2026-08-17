import { AbiCoder } from "ethers";

import type { CurrentContracts, V14Contracts } from "../contracts";
import type { ActiveProtocolView } from "../view";
import { GuardedFacade } from "../view";

export type PDAOGovernanceContracts = V14Contracts | CurrentContracts;

export interface PDAOTreeNode {
    hash: string;
    sum: bigint;
}

export const PDAO_VOTE = {
    noVote: 0n,
    abstain: 1n,
    for: 2n,
    against: 3n,
    veto: 4n,
} as const;

export interface PDAOProposalDetails {
    state: bigint;
    proposalBlock: bigint;
    start: bigint;
    phase1End: bigint;
    phase2End: bigint;
    expires: bigint;
    votingPowerFor: bigint;
    votingPowerAgainst: bigint;
    votingPowerVeto: bigint;
    votingPowerRequired: bigint;
    vetoed: boolean;
    finalised: boolean;
}

export type PDAOSettingValue =
    | { type: "uint"; value: bigint }
    | { type: "bool"; value: boolean }
    | { type: "address"; value: string };

export interface PDAOBootstrapSetting {
    contract: string;
    path: string;
    value: PDAOSettingValue;
}

export class PDAOBootstrapActions<C extends PDAOGovernanceContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    private async signer(caller?: string) {
        return caller
            ? this.view.context.actor(caller)
            : this.view.context.guardian();
    }

    disabled(): Promise<boolean> {
        this.active();
        return this.contracts.rocketDAOProtocol.getBootstrapModeDisabled();
    }

    async enableGovernance(options: { caller?: string } = {}): Promise<void> {
        this.active();
        await (await this.contracts.rocketDAOProtocol.connect(
            await this.signer(options.caller),
        ).bootstrapEnableGovernance()).wait();
    }

    async disable(options: { caller?: string } = {}): Promise<void> {
        this.active();
        await (await this.contracts.rocketDAOProtocol.connect(
            await this.signer(options.caller),
        ).bootstrapDisable(true)).wait();
    }

    async setSetting(
        setting: PDAOBootstrapSetting,
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const dao = this.contracts.rocketDAOProtocol.connect(await this.signer(options.caller));
        if (setting.value.type === "uint") {
            await (await dao.bootstrapSettingUint(
                setting.contract,
                setting.path,
                setting.value.value,
            )).wait();
        } else if (setting.value.type === "bool") {
            await (await dao.bootstrapSettingBool(
                setting.contract,
                setting.path,
                setting.value.value,
            )).wait();
        } else {
            await (await dao.bootstrapSettingAddress(
                setting.contract,
                setting.path,
                setting.value.value,
            )).wait();
        }
    }

    async setSettings(
        settings: readonly PDAOBootstrapSetting[],
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const coder = AbiCoder.defaultAbiCoder();
        const types: bigint[] = [];
        const values: string[] = [];
        for (const setting of settings) {
            if (setting.value.type === "uint") {
                types.push(0n);
                values.push(coder.encode(["uint256"], [setting.value.value]));
            } else if (setting.value.type === "bool") {
                types.push(1n);
                values.push(coder.encode(["bool"], [setting.value.value]));
            } else {
                types.push(2n);
                values.push(coder.encode(["address"], [setting.value.value]));
            }
        }
        await (await this.contracts.rocketDAOProtocol.connect(
            await this.signer(options.caller),
        ).bootstrapSettingMulti(
            settings.map(setting => setting.contract),
            settings.map(setting => setting.path),
            types,
            values,
        )).wait();
    }

    async setAddressList(
        contract: string,
        path: string,
        actors: readonly string[],
        options: { caller?: string } = {},
    ): Promise<void> {
        this.active();
        const addresses = await Promise.all(actors.map(actor => this.view.context.actorAddress(actor)));
        await (await this.contracts.rocketDAOProtocol.connect(
            await this.signer(options.caller),
        ).bootstrapSettingAddressList(contract, path, addresses)).wait();
    }
}

export class PDAOProposalActions<C extends PDAOGovernanceContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    total(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolProposal.getTotal();
    }

    async propose(
        message: string,
        payload: string,
        block: bigint,
        nodes: readonly PDAOTreeNode[],
        options: { caller: string },
    ): Promise<bigint> {
        this.active();
        const total = await this.total();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolProposal.connect(signer).propose(
            message,
            payload,
            block,
            [...nodes],
        )).wait();
        return total + 1n;
    }

    async vote(
        id: bigint,
        direction: bigint,
        votingPower: bigint,
        nodeIndex: bigint,
        witness: readonly PDAOTreeNode[],
        options: { caller: string },
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolProposal.connect(signer).vote(
            id,
            direction,
            votingPower,
            nodeIndex,
            [...witness],
        )).wait();
    }

    async overrideVote(id: bigint, direction: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolProposal.connect(signer).overrideVote(
            id,
            direction,
        )).wait();
    }

    async execute(id: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolProposal.connect(signer).execute(id)).wait();
    }

    async finalise(id: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolProposal.connect(signer).finalise(id)).wait();
    }

    async destroy(id: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolProposal.connect(signer).destroy(id)).wait();
    }

    async receipt(id: bigint, actor: string): Promise<{ direction: bigint; phase1: boolean }> {
        this.active();
        const address = await this.view.context.actorAddress(actor);
        const [direction, phase1] = await Promise.all([
            this.contracts.rocketDAOProtocolProposal.getReceiptDirection(id, address),
            this.contracts.rocketDAOProtocolProposal.getReceiptHasVotedPhase1(id, address),
        ]);
        return { direction, phase1 };
    }

    async details(id: bigint): Promise<PDAOProposalDetails> {
        this.active();
        const proposal = this.contracts.rocketDAOProtocolProposal;
        const [state, proposalBlock, start, phase1End, phase2End, expires,
            votingPowerFor, votingPowerAgainst, votingPowerVeto, votingPowerRequired,
            vetoed, finalised] = await Promise.all([
            proposal.getState(id), proposal.getProposalBlock(id), proposal.getStart(id),
            proposal.getPhase1End(id), proposal.getPhase2End(id), proposal.getExpires(id),
            proposal.getVotingPowerFor(id), proposal.getVotingPowerAgainst(id),
            proposal.getVotingPowerVeto(id), proposal.getVotingPowerRequired(id),
            proposal.getVetoed(id), proposal.getFinalised(id),
        ]);
        return { state, proposalBlock, start, phase1End, phase2End, expires,
            votingPowerFor, votingPowerAgainst, votingPowerVeto, votingPowerRequired,
            vetoed, finalised };
    }
}

export class PDAOVerifierActions<C extends PDAOGovernanceContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    depthPerRound(): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolVerifier.getDepthPerRound();
    }

    challengeBond(id: bigint): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolVerifier.getChallengeBond(id);
    }

    proposalBond(id: bigint): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolVerifier.getProposalBond(id);
    }

    challengePeriod(id: bigint): Promise<bigint> {
        this.active();
        return this.contracts.rocketDAOProtocolVerifier.getChallengePeriod(id);
    }

    async createChallenge(
        id: bigint,
        index: bigint,
        node: PDAOTreeNode,
        witness: readonly PDAOTreeNode[],
        options: { caller: string },
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolVerifier.connect(signer).createChallenge(
            id, index, node, [...witness],
        )).wait();
    }

    async submitRoot(
        id: bigint,
        index: bigint,
        nodes: readonly PDAOTreeNode[],
        options: { caller: string },
    ): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolVerifier.connect(signer).submitRoot(
            id, index, [...nodes],
        )).wait();
    }

    async defeat(id: bigint, index: bigint, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolVerifier.connect(signer).defeatProposal(
            id, index,
        )).wait();
    }

    async claimProposer(id: bigint, indices: readonly bigint[], options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolVerifier.connect(signer).claimBondProposer(
            id, [...indices],
        )).wait();
    }

    async claimChallenger(id: bigint, indices: readonly bigint[], options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await this.contracts.rocketDAOProtocolVerifier.connect(signer).claimBondChallenger(
            id, [...indices],
        )).wait();
    }
}

export class PDAOGovernanceActions<C extends PDAOGovernanceContracts> {
    readonly proposals: PDAOProposalActions<C>;
    readonly verifier: PDAOVerifierActions<C>;

    constructor(view: ActiveProtocolView<any, any>) {
        this.proposals = new PDAOProposalActions<C>(view);
        this.verifier = new PDAOVerifierActions<C>(view);
    }
}
