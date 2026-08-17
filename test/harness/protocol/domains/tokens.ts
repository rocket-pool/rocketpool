import type { ContractTransactionReceipt } from "ethers";

import type { ProtocolContracts } from "../contracts";
import { GuardedFacade } from "../view";
import { ethers } from "../../../../test-old/_utils/hardhat-runtime";

export class TokenActions<C extends ProtocolContracts> extends GuardedFacade {
    private get contracts(): C {
        return this.view.contracts as C;
    }

    async mintRpl(name: string, amount: bigint): Promise<void> {
        await this.mintFixedSupplyRpl(name, amount);
        await this.approveFixedSupplyRpl(name, amount);
        await this.swapFixedSupplyRpl(name, amount);
    }

    async mintFixedSupplyRpl(name: string, amount: bigint): Promise<void> {
        this.active();
        const guardian = await this.view.context.guardian();
        const address = await this.view.context.actorAddress(name);
        await (await this.contracts.rocketTokenRPLFixedSupply.connect(guardian).mint(address, amount)).wait();
        this.view.context.trace(`minted ${amount} fixed-supply RPL for ${name}`);
    }

    async approveFixedSupplyRpl(name: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketTokenRPLFixedSupply.connect(signer).approve(
            await this.contracts.rocketTokenRPL.getAddress(),
            amount,
        )).wait();
        this.view.context.trace(`approved ${amount} fixed-supply RPL for swapping by ${name}`);
    }

    async swapFixedSupplyRpl(name: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(name);
        await (await this.contracts.rocketTokenRPL.connect(signer).swapTokens(amount)).wait();
        this.view.context.trace(`swapped ${amount} fixed-supply RPL for ${name}`);
    }

    async mintRplInflation(caller: string): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(caller);
        await (await this.contracts.rocketTokenRPL.connect(signer).inflationMintTokens()).wait();
        this.view.context.trace(`minted available RPL inflation as ${caller}`);
    }

    async rplBalance(name: string): Promise<bigint> {
        this.active();
        return this.contracts.rocketTokenRPL.balanceOf(await this.view.context.actorAddress(name));
    }

    async rplSupply(): Promise<bigint> {
        this.active();
        return this.contracts.rocketTokenRPL.totalSupply();
    }

    async rethBalance(name: string): Promise<bigint> {
        this.active();
        return this.contracts.rocketTokenRETH.balanceOf(await this.view.context.actorAddress(name));
    }

    async rethSupply(): Promise<bigint> {
        this.active();
        return this.contracts.rocketTokenRETH.totalSupply();
    }

    async rethExchangeRate(): Promise<bigint> {
        this.active();
        return this.contracts.rocketTokenRETH.getExchangeRate();
    }

    async rethValue(ethAmount: bigint): Promise<bigint> {
        this.active();
        return this.contracts.rocketTokenRETH.getRethValue(ethAmount);
    }

    async rethEthValue(rethAmount: bigint): Promise<bigint> {
        this.active();
        return this.contracts.rocketTokenRETH.getEthValue(rethAmount);
    }

    async rethCollateralRate(): Promise<bigint> {
        this.active();
        return this.contracts.rocketTokenRETH.getCollateralRate();
    }

    async rethContractBalance(): Promise<bigint> {
        this.active();
        return ethers.provider.getBalance(await this.contracts.rocketTokenRETH.getAddress());
    }

    async transferReth(from: string, to: string, amount: bigint): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(from);
        const recipient = await this.view.context.actorAddress(to);
        await (await this.contracts.rocketTokenRETH.connect(signer).transfer(recipient, amount)).wait();
        this.view.context.trace(`transferred ${amount} rETH from ${from} to ${to}`);
    }

    async burnReth(holder: string, amount: bigint): Promise<ContractTransactionReceipt> {
        this.active();
        const signer = await this.view.context.actor(holder);
        const receipt = await (await this.contracts.rocketTokenRETH.connect(signer).burn(amount)).wait();
        if (!receipt) throw new Error("rETH burn transaction was not mined");
        this.view.context.trace(`burned ${amount} rETH for ${holder}`);
        return receipt;
    }

    async depositExcessRethCollateral(caller: string): Promise<void> {
        this.active();
        const signer = await this.view.context.actor(caller);
        await (await this.contracts.rocketTokenRETH.connect(signer).depositExcessCollateral()).wait();
        this.view.context.trace(`deposited excess rETH collateral as ${caller}`);
    }
}
