import { decompressABI } from './abi';

import {
    ethers,
    getHardhatRuntime,
} from './hardhat-runtime';

class Artifact {
    constructor(name) {
        this.name = name;
        this.abi = undefined;
        this.contractName = undefined;
        this.sourceName = undefined;
        this.instance = null;
    }

    async initialise() {
        const hreArtifact = await getHardhatRuntime().artifacts.readArtifact(this.name);
        this.abi = hreArtifact.abi;
        this.contractName = hreArtifact.contractName;
        this.sourceName = hreArtifact.sourceName;
    }

    async deployed() {
        return this.instance;
    }

    setAsDeployed(instance) {
        this.instance = instance;
    }

    async newImmediate(...args) {
        this.instance = await (await ethers.getContractFactory(this.name)).deploy(...args);
        return this.instance;
    }

    async new(...args) {
        this.instance = await (await ethers.getContractFactory(this.name)).deploy(...args);
        await this.instance.waitForDeployment();
        return this.instance;
    }

    async clone(...args) {
        const instance = await (await ethers.getContractFactory(this.name)).deploy(...args);
        await instance.waitForDeployment();
        return instance;
    }

    at(address) {
        return new ethers.Contract(address, this.abi, ethers.provider);
    }

    async fromDeployment(rocketStorage, contractName = null) {
        if (contractName === null) {
            contractName = this.name.charAt(0).toLowerCase() + this.name.slice(1);
        }

        const addressKey = ethers.solidityPackedKeccak256(['string', 'string'], ['contract.address', contractName]);
        const abiKey = ethers.solidityPackedKeccak256(['string', 'string'], ['contract.abi', contractName]);

        const address = await rocketStorage['getAddress(bytes32)'](addressKey);
        const abiRaw = await rocketStorage['getString(bytes32)'](abiKey);

        if (address === '0x0000000000000000000000000000000000000000' || abiRaw === '') {
            return;
        }

        this.abi = decompressABI(abiRaw);

        this.instance = new ethers.Contract(address, this.abi, ethers.provider);
    }
}

export class Artifacts {
    constructor() {
        this.artifacts = {};
    }

    require(name) {
        if (!this.artifacts.hasOwnProperty(name)) {
            this.artifacts[name] = new Artifact(name);
        }
        return this.artifacts[name];
    }

    async loadFromDeployment(rocketStorageAddress) {
        const RocketStorage = this.require('RocketStorage');
        RocketStorage.instance = RocketStorage.at(rocketStorageAddress);
        // Map between network contract name and actual contract name
        const mapping = {
            'RocketTokenDummyRPL': 'rocketTokenRPLFixedSupply',
        };
        for (const name in this.artifacts) {
            switch (name) {
                case 'RocketStorage':
                    break;
                default:
                    if (mapping.hasOwnProperty(name)) {
                        await this.artifacts[name].fromDeployment(RocketStorage.instance, mapping[name]);
                    } else {
                        await this.artifacts[name].fromDeployment(RocketStorage.instance);
                    }
            }
        }
    }
}

export const artifacts = new Artifacts();

export async function initialiseArtifacts() {
    await Promise.all(
        Object.values(artifacts.artifacts).map(artifact => artifact.initialise()),
    );
}

