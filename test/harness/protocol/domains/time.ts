import { helpers, time } from "../../../../test-old/_utils/hardhat-runtime";
import type { CurrentContracts, ProtocolContracts } from "../contracts";
import { GuardedFacade } from "../view";
import { ODAOMinipoolSettingsActions } from "./odao";

export class TimeActions<C extends ProtocolContracts> extends GuardedFacade {
    async latest(): Promise<bigint> {
        this.active();
        return BigInt(await time.latest());
    }

    async advance(seconds: bigint): Promise<void> {
        this.active();
        if (seconds < 0n) throw new Error("Cannot advance time by a negative duration");
        await time.increase(seconds);
        this.view.context.trace(`advanced time by ${seconds}s`);
    }

    async mineBlocks(blocks: bigint): Promise<void> {
        this.active();
        if (blocks < 0n) throw new Error("Cannot mine a negative number of blocks");
        await helpers.mine(blocks);
        this.view.context.trace(`mined ${blocks} blocks`);
    }

    async advanceMinipoolScrubPeriod(): Promise<void> {
        this.active();
        const scrubPeriod = await new ODAOMinipoolSettingsActions<C>(this.view).getScrubPeriod();
        await time.increase(scrubPeriod + 1n);
        this.view.context.trace(`advanced past minipool scrub period (${scrubPeriod}s)`);
    }

    async advanceMinipoolPromotionScrubPeriod(): Promise<void> {
        this.active();
        const scrubPeriod = await new ODAOMinipoolSettingsActions<C>(
            this.view,
        ).getPromotionScrubPeriod();
        await time.increase(scrubPeriod + 1n);
        this.view.context.trace(
            `advanced past minipool promotion scrub period (${scrubPeriod}s)`,
        );
    }

    async advanceMinipoolLaunchTimeout(): Promise<void> {
        this.active();
        const timeout = await (this.view.contracts as C)
            .rocketDAOProtocolSettingsMinipool.getLaunchTimeout();
        await time.increase(timeout + 1n);
        this.view.context.trace(`advanced past minipool launch timeout (${timeout}s)`);
    }

    async advanceMinipoolBondReductionWindowStart(): Promise<void> {
        this.active();
        const start = await new ODAOMinipoolSettingsActions<C>(this.view)
            .getBondReductionWindowStart();
        await time.increase(start + 1n);
        this.view.context.trace(`advanced into minipool bond reduction window (${start}s)`);
    }

    async advancePastMinipoolBondReductionWindow(): Promise<void> {
        this.active();
        const settings = new ODAOMinipoolSettingsActions<C>(this.view);
        const [start, length] = await Promise.all([
            settings.getBondReductionWindowStart(),
            settings.getBondReductionWindowLength(),
        ]);
        await time.increase(start + length + 1n);
        this.view.context.trace(`advanced past minipool bond reduction window (${start + length}s)`);
    }

    async advanceMinipoolUserDistributeStart(): Promise<void> {
        this.active();
        const contracts = this.view.contracts as C;
        const start = await contracts.rocketDAOProtocolSettingsMinipool
            .getUserDistributeWindowStart();
        await time.increase(start + 1n);
        this.view.context.trace(`advanced into minipool user distribution window (${start}s)`);
    }

    async advanceMinipoolUserDistributeWindow(): Promise<void> {
        this.active();
        const contracts = this.view.contracts as C;
        const [start, length] = await Promise.all([
            contracts.rocketDAOProtocolSettingsMinipool.getUserDistributeWindowStart(),
            contracts.rocketDAOProtocolSettingsMinipool.getUserDistributeWindowLength(),
        ]);
        await time.increase(start + length + 1n);
        this.view.context.trace(
            `advanced past minipool user distribution window (${start + length}s)`,
        );
    }

    async advanceRplUnstakingPeriod(): Promise<void> {
        this.active();
        const contracts = this.view.contracts as C;
        const settings = contracts.rocketDAOProtocolSettingsNode as CurrentContracts["rocketDAOProtocolSettingsNode"];
        const period = await settings.getUnstakingPeriod();
        await time.increase(period + 1n);
        this.view.context.trace(`advanced past RPL unstaking period (${period}s)`);
    }

    async advanceRplWithdrawalCooldown(): Promise<void> {
        this.active();
        const contracts = this.view.contracts as C;
        const settings = contracts.rocketDAOProtocolSettingsNode as CurrentContracts["rocketDAOProtocolSettingsNode"];
        const cooldown = await settings.getWithdrawalCooldown();
        await time.increase(cooldown + 1n);
        this.view.context.trace(`advanced past RPL withdrawal cooldown (${cooldown}s)`);
    }
}
