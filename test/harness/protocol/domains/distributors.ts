import { RocketNodeDistributorDelegate__factory as V14NodeDistributorDelegateFactory } from "../../bindings/v1_4";
import { ethers } from "../../../../test-old/_utils/hardhat-runtime";
import type { CurrentContracts, V14Contracts } from "../contracts";
import { GuardedFacade } from "../view";

export class NodeDistributorActions<C extends V14Contracts | CurrentContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async address(node: string): Promise<string> {
        this.active();
        return this.contracts.rocketNodeDistributorFactory.getProxyAddress(
            await this.view.context.actorAddress(node),
        );
    }

    async balance(node: string): Promise<bigint> {
        this.active();
        return ethers.provider.getBalance(await this.address(node));
    }

    async nodeShare(node: string): Promise<bigint> {
        this.active();
        return V14NodeDistributorDelegateFactory.connect(
            await this.address(node),
            ethers.provider,
        ).getNodeShare();
    }

    async userShare(node: string): Promise<bigint> {
        this.active();
        return V14NodeDistributorDelegateFactory.connect(
            await this.address(node),
            ethers.provider,
        ).getUserShare();
    }

    async rethBalance(): Promise<bigint> {
        this.active();
        return ethers.provider.getBalance(await this.contracts.rocketTokenRETH.getAddress());
    }

    async fund(node: string, from: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(from);
        await (await signer.sendTransaction({
            to: await this.address(node),
            value: amount,
        })).wait();
        this.view.context.trace(`funded ${node} distributor with ${amount} wei from ${from}`);
    }

    async distribute(node: string, options: { caller: string }): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(options.caller);
        await (await V14NodeDistributorDelegateFactory.connect(
            await this.address(node),
            signer,
        ).distribute()).wait();
        this.view.context.trace(`distributed ${node} rewards as ${options.caller}`);
    }
}
