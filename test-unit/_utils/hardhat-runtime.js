require('./hardhat-runtime-bootstrap');

let hardhatRuntime;
let networkConnection;

function requireConnection() {
    if (!networkConnection) {
        throw new Error(
            'Hardhat runtime has not been initialised. '
            + 'Run tests through the Hardhat Mocha task or call initialiseHardhatRuntime() first.',
        );
    }
    return networkConnection;
}

function lazyProxy(resolve, bindFunctions = true) {
    return new Proxy({}, {
        get(_target, property) {
            const target = resolve();
            const value = Reflect.get(target, property);
            return bindFunctions && typeof value === 'function' ? value.bind(target) : value;
        },
        set(_target, property, value) {
            return Reflect.set(resolve(), property, value);
        },
        has(_target, property) {
            return Reflect.has(resolve(), property);
        },
    });
}

async function initialiseHardhatRuntime() {
    if (networkConnection) return networkConnection;

    hardhatRuntime = await import('hardhat');
    const networkName = hardhatRuntime.globalOptions.network ?? 'hardhat';
    networkConnection = await hardhatRuntime.network.create(networkName);
    return networkConnection;
}

async function initialiseTestRuntime() {
    await initialiseHardhatRuntime();
    const { initialiseArtifacts } = require('./artifacts');
    await initialiseArtifacts();
    return networkConnection;
}

async function disposeHardhatRuntime() {
    if (!networkConnection) return;
    await networkConnection.close();
    networkConnection = undefined;
}

function getHardhatRuntime() {
    if (!hardhatRuntime) {
        throw new Error('Hardhat runtime has not been initialised');
    }
    return hardhatRuntime;
}

function getNetworkConnection() {
    return requireConnection();
}

// Ethers exposes constructors with static methods (for example AbiCoder), so
// binding every function would strip those statics from the proxy result.
const ethers = lazyProxy(() => requireConnection().ethers, false);
const helpers = lazyProxy(() => requireConnection().networkHelpers);
const time = lazyProxy(() => requireConnection().networkHelpers.time);
const provider = lazyProxy(() => requireConnection().ethers.provider);
const network = {
    provider,
};

exports.initialiseHardhatRuntime = initialiseHardhatRuntime;
exports.initialiseTestRuntime = initialiseTestRuntime;
exports.disposeHardhatRuntime = disposeHardhatRuntime;
exports.getHardhatRuntime = getHardhatRuntime;
exports.getNetworkConnection = getNetworkConnection;
exports.ethers = ethers;
exports.helpers = helpers;
exports.time = time;
exports.provider = provider;
exports.network = network;
