import { Contract, ContractFactory, Signer, ethers as ethersLibrary } from "ethers";
import pako from "pako";

import { ethers, getHardhatRuntime } from "../../test-old/_utils/hardhat-runtime";
import { getReleaseArtifact, HistoricalRelease, ReleaseArtifact } from "./releases/catalog";
import { baseContractNames, LogicalContractName, v14UpgradeContractNames } from "./releases/contracts";

const ZERO_ADDRESS = ethersLibrary.ZeroAddress;
const ETHER = 10n ** 18n;
const MAINNET_BEACON_ROOTS = "0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02";
const MAINNET_GENESIS_TIME = 1606824023n;
const MAINNET_GENESIS_ROOT = "0x4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95";
const WITHDRAWAL_REQUEST_PREDEPLOY = "0x00000961Ef480Eb55e80D19ad83579A64c007002";
const FORK_SLOTS = [
    74240n * 32n,
    144896n * 32n,
    194048n * 32n,
    269568n * 32n,
    364032n * 32n,
];

export interface DeploymentJournalEntry {
    release: string;
    address: string;
    artifactName: string;
}

export interface DeploymentState {
    rocketStorageAddress: string;
    activeRelease: "1.3.1" | "1.4" | "current";
    active: Map<string, DeploymentJournalEntry>;
    history: Map<string, DeploymentJournalEntry[]>;
}

function compressAbi(abi: readonly unknown[]): string {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString("base64");
}

function minipoolProxyAbi(delegateAbi: readonly unknown[], baseAbi: readonly unknown[]): unknown[] {
    const abi = [...delegateAbi, ...baseAbi].filter(
        (item: any) => item.type !== "fallback" && item.type !== "receive",
    );
    abi.push({ stateMutability: "payable", type: "fallback" });
    abi.push({ stateMutability: "payable", type: "receive" });
    return abi;
}

function addressKey(name: string): string {
    return ethers.solidityPackedKeccak256(["string", "string"], ["contract.address", name]);
}

function simpleKey(name: string): string {
    return ethers.solidityPackedKeccak256(["string"], [name]);
}

async function deployArtifact(
    signer: Signer,
    artifact: ReleaseArtifact,
    args: readonly unknown[] = [],
): Promise<Contract> {
    const factory = new ContractFactory(artifact.abi as any, artifact.bytecode, signer);
    const instance = await factory.deploy(...args) as unknown as Contract;
    await instance.waitForDeployment();
    return instance;
}

function record(
    state: DeploymentState,
    logicalName: string,
    release: string,
    artifactName: string,
    address: string,
): void {
    const entry = { release, artifactName, address };
    const previous = state.active.get(logicalName);
    if (previous && previous.address.toLowerCase() !== address.toLowerCase()) {
        const history = state.history.get(logicalName) ?? [];
        history.push(previous);
        state.history.set(logicalName, history);
    }
    state.active.set(logicalName, entry);
}

async function wait(transaction: Promise<any>): Promise<void> {
    const response = await transaction;
    await response.wait();
}

async function registerContract(
    storage: Contract,
    logicalName: string,
    address: string,
    abi: readonly unknown[],
    setAddress = true,
): Promise<void> {
    await wait(storage.setBool(
        ethers.solidityPackedKeccak256(["string", "address"], ["contract.exists", address]),
        true,
    ));
    await wait(storage.setString(
        ethers.solidityPackedKeccak256(["string", "address"], ["contract.name", address]),
        logicalName,
    ));
    if (setAddress) {
        await wait(storage.setAddress(addressKey(logicalName), address));
    }
    await wait(storage.setString(
        ethers.solidityPackedKeccak256(["string", "string"], ["contract.abi", logicalName]),
        compressAbi(abi),
    ));
}

async function setDefaultParameters(state: DeploymentState, signer: Signer): Promise<void> {
    const daoEntry = state.active.get("rocketDAOProtocol");
    if (!daoEntry) throw new Error("rocketDAOProtocol is not deployed");

    const daoArtifact = getReleaseArtifact("1.3.1", "RocketDAOProtocol");
    const dao = new Contract(daoEntry.address, daoArtifact.abi, signer);
    const uintSettings: Array<[string, string, bigint]> = [
        ["rocketDAOProtocolSettingsDeposit", "deposit.pool.maximum", 1000n * ETHER],
        ["rocketDAOProtocolSettingsNetwork", "network.node.fee.minimum", 5n * ETHER / 100n],
        ["rocketDAOProtocolSettingsNetwork", "network.node.fee.target", ETHER / 10n],
        ["rocketDAOProtocolSettingsNetwork", "network.node.fee.maximum", ETHER / 5n],
        ["rocketDAOProtocolSettingsNetwork", "network.node.demand.range", 1000n * ETHER],
        ["rocketDAOProtocolSettingsInflation", "rpl.inflation.interval.start", BigInt(Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60)],
    ];
    const boolSettings: Array<[string, string, boolean]> = [
        ["rocketDAOProtocolSettingsDeposit", "deposit.enabled", true],
        ["rocketDAOProtocolSettingsDeposit", "deposit.assign.enabled", true],
        ["rocketDAOProtocolSettingsNode", "node.registration.enabled", true],
        ["rocketDAOProtocolSettingsNode", "node.deposit.enabled", true],
        ["rocketDAOProtocolSettingsMinipool", "minipool.submit.withdrawable.enabled", true],
        ["rocketDAOProtocolSettingsMinipool", "minipool.bond.reduction.enabled", true],
        ["rocketDAOProtocolSettingsNode", "node.vacant.minipools.enabled", true],
    ];

    for (const [contractName, setting, value] of uintSettings) {
        await wait(dao.bootstrapSettingUint(contractName, setting, value));
    }
    for (const [contractName, setting, value] of boolSettings) {
        await wait(dao.bootstrapSettingBool(contractName, setting, value));
    }
}

export async function deployV131(): Promise<DeploymentState> {
    const [guardian] = await ethers.getSigners();
    const storageArtifact = getReleaseArtifact("1.3.1", "RocketStorage");
    const storage = await deployArtifact(guardian, storageArtifact);
    const storageAddress = await storage.getAddress();
    const deploymentReceipt = await storage.deploymentTransaction()!.wait();

    const state: DeploymentState = {
        rocketStorageAddress: storageAddress,
        activeRelease: "1.3.1",
        active: new Map(),
        history: new Map(),
    };
    record(state, "rocketStorage", "1.3.1", "RocketStorage", storageAddress);

    const depositArtifact = getReleaseArtifact("1.3.1", "DepositContract");
    const deposit = await deployArtifact(guardian, depositArtifact);
    record(state, "casperDeposit", "1.3.1", "DepositContract", await deposit.getAddress());

    for (const [logicalName, artifactName] of Object.entries(baseContractNames)) {
        if (logicalName === "rocketStorage") continue;
        const artifact = getReleaseArtifact("1.3.1", artifactName);
        let args: readonly unknown[] = [storageAddress];
        if (logicalName === "rocketTokenRPL") {
            const fixedSupply = state.active.get("rocketTokenRPLFixedSupply");
            if (!fixedSupply) throw new Error("Fixed-supply RPL must be deployed first");
            args = [storageAddress, fixedSupply.address];
        } else if (
            logicalName === "rocketMinipoolDelegate"
            || logicalName === "rocketNodeDistributorDelegate"
            || logicalName === "rocketMinipoolBase"
        ) {
            args = [];
        }

        const instance = await deployArtifact(guardian, artifact, args);
        const instanceAddress = await instance.getAddress();
        record(state, logicalName, "1.3.1", artifactName, instanceAddress);

        if (logicalName === "rocketVault" || logicalName === "rocketTokenRETH") {
            await wait(storage.setAddress(addressKey(logicalName), instanceAddress));
        }
    }

    for (const [logicalName, entry] of state.active) {
        const artifact = logicalName === "casperDeposit"
            ? depositArtifact
            : getReleaseArtifact("1.3.1", entry.artifactName);
        await registerContract(
            storage,
            logicalName,
            entry.address,
            artifact.abi,
            logicalName !== "rocketVault" && logicalName !== "rocketTokenRETH",
        );
    }

    const combinedMinipoolAbi = minipoolProxyAbi(
        getReleaseArtifact("1.3.1", "RocketMinipoolDelegate").abi,
        getReleaseArtifact("1.3.1", "RocketMinipoolBase").abi,
    );
    await wait(storage.setString(
        ethers.solidityPackedKeccak256(["string", "string"], ["contract.abi", "rocketMinipool"]),
        compressAbi(combinedMinipoolAbi),
    ));

    await wait(storage.setUint(simpleKey("deploy.block"), deploymentReceipt!.blockNumber));
    await wait(storage.setString(simpleKey("protocol.version"), "1.3.1"));
    await wait(storage.setDeployedStatus());
    await setDefaultParameters(state, guardian);
    return state;
}

const upgradeA = [
    "rocketMegapoolDelegate",
    "rocketMegapoolFactory",
    "rocketMegapoolProxy",
    "rocketMegapoolManager",
    "rocketNodeManager",
    "rocketNodeDeposit",
    "rocketNodeStaking",
    "rocketDepositPool",
    "linkedListStorage",
    "rocketDAOProtocol",
    "rocketDAOProtocolProposals",
    "rocketDAOProtocolSettingsNode",
    "rocketDAOProtocolSettingsDeposit",
    "rocketDAOProtocolSettingsNetwork",
    "rocketDAOProtocolSettingsSecurity",
    "rocketDAOProtocolSettingsMegapool",
    "rocketDAOProtocolSettingsMinipool",
] as const;

const upgradeB = [
    "rocketDAOSecurityUpgrade",
    "rocketDAOSecurityProposals",
    "rocketDAONodeTrustedUpgrade",
    "rocketNetworkRevenues",
    "rocketNetworkBalances",
    "rocketNetworkSnapshots",
    "rocketNetworkPenalties",
    "rocketRewardsPool",
    "beaconStateVerifier",
    "rocketNodeDistributorDelegate",
    "rocketClaimDAO",
    "rocketMinipoolBondReducer",
    "rocketMinipoolManager",
    "rocketNetworkVoting",
    "rocketMerkleDistributorMainnet",
    "rocketMegapoolPenalties",
    "rocketNetworkSnapshotsTime",
    "rocketDAOProtocolSettingsProposals",
] as const;

export async function upgradeToV14(state: DeploymentState): Promise<void> {
    if (state.activeRelease !== "1.3.1") {
        throw new Error(`Cannot apply the 1.4 upgrade to ${state.activeRelease}`);
    }

    const [guardian] = await ethers.getSigners();
    const deployed = new Map<string, { artifactName: string; artifact: ReleaseArtifact; instance: Contract }>();

    for (const [logicalName, artifactName] of Object.entries(v14UpgradeContractNames)) {
        const artifact = getReleaseArtifact("1.4", artifactName);
        let args: readonly unknown[] = [state.rocketStorageAddress];
        if (logicalName === "rocketNodeDistributorDelegate") {
            args = [];
        } else if (logicalName === "beaconStateVerifier") {
            args = [
                state.rocketStorageAddress,
                8192n,
                FORK_SLOTS,
                MAINNET_BEACON_ROOTS,
                MAINNET_GENESIS_TIME,
                MAINNET_GENESIS_ROOT,
            ];
        }
        deployed.set(logicalName, {
            artifactName,
            artifact,
            instance: await deployArtifact(guardian, artifact, args),
        });
    }

    const upgradeArtifact = getReleaseArtifact("1.4", "RocketUpgradeOneDotFour");
    const upgrade = await deployArtifact(guardian, upgradeArtifact, [state.rocketStorageAddress]);
    const addresses = async (names: readonly string[]) => Promise.all(names.map(async name => deployed.get(name)!.instance.getAddress()));
    const abis = (names: readonly string[]) => names.map(name => compressAbi(deployed.get(name)!.artifact.abi));
    await wait(upgrade.setA(await addresses(upgradeA), abis(upgradeA)));
    await wait(upgrade.setB(await addresses(upgradeB), abis(upgradeB)));

    const trustedEntry = state.active.get("rocketDAONodeTrusted");
    if (!trustedEntry) throw new Error("rocketDAONodeTrusted is not deployed");
    const trusted = new Contract(
        trustedEntry.address,
        getReleaseArtifact("1.3.1", "RocketDAONodeTrusted").abi,
        guardian,
    );
    await wait(trusted.bootstrapUpgrade(
        "addContract",
        "rocketUpgradeOneDotFour",
        compressAbi(upgradeArtifact.abi),
        await upgrade.getAddress(),
    ));
    await wait(upgrade.execute());

    for (const [logicalName, deployedContract] of deployed) {
        record(
            state,
            logicalName,
            "1.4",
            deployedContract.artifactName,
            await deployedContract.instance.getAddress(),
        );
    }
    record(state, "rocketUpgradeOneDotFour", "1.4", "RocketUpgradeOneDotFour", await upgrade.getAddress());
    state.activeRelease = "1.4";
    await assertProtocolVersion(state, "1.4");
}

async function currentArtifact(contractName: string): Promise<ReleaseArtifact> {
    const hreArtifact = await getHardhatRuntime().artifacts.readArtifact(contractName);
    return {
        contractName: hreArtifact.contractName,
        sourceName: hreArtifact.sourceName,
        abi: hreArtifact.abi,
        bytecode: hreArtifact.bytecode,
        deployedBytecode: hreArtifact.deployedBytecode,
        linkReferences: hreArtifact.linkReferences,
        deployedLinkReferences: hreArtifact.deployedLinkReferences,
    };
}

const currentUpgradeContracts = {
    rocketMegapoolDelegate: "RocketMegapoolDelegate",
    rocketMinipoolDelegate: "RocketMinipoolDelegate",
    rocketMegapoolManager: "RocketMegapoolManager",
    rocketDAOProtocolSettingsMegapool: "RocketDAOProtocolSettingsMegapool",
    rocketNetworkRedemptions: "RocketNetworkRedemptions",
    rocketDAOProtocolSettingsNetwork: "RocketDAOProtocolSettingsNetwork",
    beaconStateVerifier: "BeaconStateVerifierMock",
    rocketNetworkParticipation: "RocketNetworkParticipation",
    rocketNetworkExit: "RocketNetworkExit",
    rocketNetworkPenalties: "RocketNetworkPenalties",
} as const;

export async function upgradeToCurrent(state: DeploymentState): Promise<void> {
    if (state.activeRelease !== "1.4") {
        throw new Error(`Cannot apply the current upgrade to ${state.activeRelease}`);
    }
    const [guardian] = await ethers.getSigners();
    const deployed = new Map<string, { artifactName: string; artifact: ReleaseArtifact; instance: Contract }>();

    for (const [logicalName, artifactName] of Object.entries(currentUpgradeContracts)) {
        const artifact = await currentArtifact(artifactName);
        let args: readonly unknown[] = [state.rocketStorageAddress];
        if (logicalName === "rocketMinipoolDelegate") {
            args = [];
        } else if (logicalName === "rocketMegapoolDelegate" || logicalName === "rocketNetworkExit") {
            args = [state.rocketStorageAddress, WITHDRAWAL_REQUEST_PREDEPLOY];
        }
        deployed.set(logicalName, {
            artifactName,
            artifact,
            instance: await deployArtifact(guardian, artifact, args),
        });
    }

    const upgradeArtifact = await currentArtifact("RocketUpgradeOneDotFive");
    const upgrade = await deployArtifact(guardian, upgradeArtifact, [state.rocketStorageAddress]);
    const names = Object.keys(currentUpgradeContracts);
    const contractAbis = names.map(name => compressAbi(deployed.get(name)!.artifact.abi));
    const combinedMinipoolAbi = minipoolProxyAbi(
        deployed.get("rocketMinipoolDelegate")!.artifact.abi,
        getReleaseArtifact("1.4", "RocketMinipoolBase").abi,
    );
    await wait(upgrade.set(
        await Promise.all(names.map(name => deployed.get(name)!.instance.getAddress())),
        [...contractAbis, compressAbi(combinedMinipoolAbi)],
    ));

    const trustedUpgradeEntry = state.active.get("rocketDAONodeTrustedUpgrade");
    if (!trustedUpgradeEntry) throw new Error("rocketDAONodeTrustedUpgrade is not deployed");
    const trustedUpgrade = new Contract(
        trustedUpgradeEntry.address,
        getReleaseArtifact("1.4", "RocketDAONodeTrustedUpgrade").abi,
        guardian,
    );
    await wait(trustedUpgrade.bootstrapUpgrade(
        "addContract",
        "rocketUpgradeOneDotFive",
        compressAbi(upgradeArtifact.abi),
        await upgrade.getAddress(),
    ));
    await wait(upgrade.execute());

    for (const [logicalName, deployedContract] of deployed) {
        record(
            state,
            logicalName,
            "current",
            deployedContract.artifactName,
            await deployedContract.instance.getAddress(),
        );
    }
    record(state, "rocketUpgradeOneDotFive", "current", "RocketUpgradeOneDotFive", await upgrade.getAddress());
    state.activeRelease = "current";
    await assertProtocolVersion(state, "1.5");
}

export async function assertProtocolVersion(state: DeploymentState, expected: string): Promise<void> {
    const storageArtifactRelease: HistoricalRelease = state.activeRelease === "1.3.1" ? "1.3.1" : "1.4";
    const storage = new Contract(
        state.rocketStorageAddress,
        getReleaseArtifact(storageArtifactRelease, "RocketStorage").abi,
        ethers.provider,
    );
    const actual = await storage["getString(bytes32)"](simpleKey("protocol.version"));
    if (actual !== expected) {
        throw new Error(`Expected protocol version ${expected}, got ${actual}`);
    }
}

export function getActiveAddress(state: DeploymentState, name: LogicalContractName | string): string {
    const entry = state.active.get(name);
    if (!entry || entry.address === ZERO_ADDRESS) {
        throw new Error(`Rocket Pool contract is not active: ${name}`);
    }
    return entry.address;
}

export function getHistoricalEntries(
    state: DeploymentState,
    name: LogicalContractName | string,
): readonly DeploymentJournalEntry[] {
    return state.history.get(name) ?? [];
}
