import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import type { NetworkConnection } from "hardhat/types/network";

export function initialiseHardhatRuntime(): Promise<NetworkConnection>;
export function initialiseTestRuntime(): Promise<NetworkConnection>;
export function disposeHardhatRuntime(): Promise<void>;
export function getHardhatRuntime(): HardhatRuntimeEnvironment;
export function getNetworkConnection(): NetworkConnection;

export const ethers: NetworkConnection["ethers"];
export const helpers: NetworkConnection["networkHelpers"];
export const time: NetworkConnection["networkHelpers"]["time"];
export const provider: NetworkConnection["ethers"]["provider"];
export const network: {
    provider: NetworkConnection["ethers"]["provider"];
};
