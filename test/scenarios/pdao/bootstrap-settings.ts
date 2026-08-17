import assert from "assert";

import type {
    PDAOBootstrapSetting,
    ProtocolCurrent,
} from "../../harness";

interface GenericSettingsContract {
    getSettingUint(path: string): Promise<bigint>;
    getSettingBool(path: string): Promise<boolean>;
    getSettingAddress(path: string): Promise<string>;
    getSettingAddressList(path: string): Promise<string[]>;
}

function settingsContract(protocol: ProtocolCurrent, name: string): GenericSettingsContract {
    const contracts = protocol.contracts as unknown as Record<string, unknown>;
    const contract = contracts[name];
    if (!contract) throw new Error(`Unknown pDAO settings contract ${name}`);
    return contract as GenericSettingsContract;
}

export async function assertBootstrapSetting(
    protocol: ProtocolCurrent,
    setting: PDAOBootstrapSetting,
): Promise<void> {
    const contract = settingsContract(protocol, setting.contract);
    if (setting.value.type === "uint") {
        assert.equal(await contract.getSettingUint(setting.path), setting.value.value);
    } else if (setting.value.type === "bool") {
        assert.equal(await contract.getSettingBool(setting.path), setting.value.value);
    } else {
        assert.equal(await contract.getSettingAddress(setting.path), setting.value.value);
    }
}

export async function setBootstrapSettingAndAssert(
    protocol: ProtocolCurrent,
    setting: PDAOBootstrapSetting,
    options: { caller?: string } = {},
): Promise<void> {
    await protocol.pdao.bootstrap.setSetting(setting, options);
    await assertBootstrapSetting(protocol, setting);
}

export async function setBootstrapSettingsAndAssert(
    protocol: ProtocolCurrent,
    settings: readonly PDAOBootstrapSetting[],
    options: { caller?: string } = {},
): Promise<void> {
    await protocol.pdao.bootstrap.setSettings(settings, options);
    for (const setting of settings) await assertBootstrapSetting(protocol, setting);
}

export async function setBootstrapAddressListAndAssert(
    protocol: ProtocolCurrent,
    contractName: string,
    path: string,
    actors: readonly string[],
): Promise<void> {
    await protocol.pdao.bootstrap.setAddressList(contractName, path, actors);
    const expected = await Promise.all(actors.map(actor => protocol.nodes.address(actor)));
    assert.deepEqual(await settingsContract(protocol, contractName).getSettingAddressList(path), expected);
}
