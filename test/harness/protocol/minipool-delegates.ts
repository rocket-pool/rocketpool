import { Contract } from "ethers";
import type { ContractRunner } from "ethers";

import {
    type RocketMinipoolDelegate as MinipoolDelegateV4,
    RocketMinipoolDelegate__factory as CurrentMinipoolDelegateFactory,
} from "../bindings/current";

const DELEGATE_VERSION_ABI = [
    "function version() view returns (uint8)",
] as const;

type DelegateConnector = (
    address: string,
    runner: ContractRunner,
) => MinipoolDelegateV4;

const delegateConnectors = new Map<number, DelegateConnector>([
    [3, (address, runner) => CurrentMinipoolDelegateFactory.connect(address, runner)],
    [4, (address, runner) => CurrentMinipoolDelegateFactory.connect(address, runner)],
]);

export async function getMinipoolDelegateVersion(
    address: string,
    runner: ContractRunner,
): Promise<number> {
    const probe = new Contract(address, DELEGATE_VERSION_ABI, runner);
    return Number(await probe.version());
}

export async function connectMinipoolDelegate(
    address: string,
    runner: ContractRunner,
): Promise<MinipoolDelegateV4> {
    const version = await getMinipoolDelegateVersion(address, runner);
    const connect = delegateConnectors.get(version);
    if (!connect) {
        throw new Error(`Unsupported minipool delegate version ${version} at ${address}`);
    }
    return connect(address, runner);
}
