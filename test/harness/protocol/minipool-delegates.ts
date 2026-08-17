import { Contract } from "ethers";
import type { ContractRunner } from "ethers";

import {
    type RocketMinipoolDelegate as MinipoolDelegateV3,
    RocketMinipoolDelegate__factory as V131MinipoolDelegateFactory,
} from "../bindings/v1_3_1";

const DELEGATE_VERSION_ABI = [
    "function version() view returns (uint8)",
] as const;

type DelegateConnector = (
    address: string,
    runner: ContractRunner,
) => MinipoolDelegateV3;

const delegateConnectors = new Map<number, DelegateConnector>([
    [3, (address, runner) => V131MinipoolDelegateFactory.connect(address, runner)],
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
): Promise<MinipoolDelegateV3> {
    const version = await getMinipoolDelegateVersion(address, runner);
    const connect = delegateConnectors.get(version);
    if (!connect) {
        throw new Error(`Unsupported minipool delegate version ${version} at ${address}`);
    }
    return connect(address, runner);
}
