import path from 'path';
import axios from 'axios';
import * as querystring from 'node:querystring';
import fs from 'fs';

function treeShake(sources, file) {
    const returns = {};

    if (!(file in sources)) {
        throw new Error(`Cannot find source for file ${file}`);
    }

    const content = sources[file].content;
    const importsOld = content.matchAll(/import "(.+)"/g);
    const importsNew = content.matchAll(/import {.+} from "(.+)"/g);

    const imports = [...importsOld, ...importsNew];

    for (const match of imports) {
        let i = match[1];

        if (!i.startsWith('@')) {
            const dir = path.dirname(file);
            i = path.normalize(path.join(dir, i));
        }

        const subImports = treeShake(sources, i);

        for (const si in subImports) {
            returns[si] = subImports[si];
        }
    }

    returns[file] = sources[file];

    return returns;
}

const defaultOpts = {
    license: 5,
    apiKey: null,
    chain: 'mainnet',
    preamble: '',
};

const endpointMap = {
    'mainnet': 'https://api.etherscan.io/api',
    'hoodi': 'https://api-hoodi.etherscan.io/api',
};

export class EtherscanVerifier {
    constructor(buildInfos, opts = {}) {
        this.buildInfos = buildInfos;
        this.opts = { ...defaultOpts, ...opts };
    }

    log(string = '\n', color = 'gray') {

        let colorCodes = {
            'white': 0,
            'gray': 37,
            'red': 31,
            'blue': 34,
            'green': 32,
        };

        console.log('\x1b[%sm%s\x1b[0m', colorCodes[color], string);
    }

    async verifyAll(contracts) {
        const results = {};

        this.log('# Verifying contracts', 'blue')

        for (const contract of contracts) {
            results[contract.contractName] = await this.verify(contract.buildInfoId, contract.sourceName, contract.contractName, contract.address, contract.constructorArgs);
        }

        return results;
    }

    async verify(buildInfoId, sourceName, contractName, address, constructorArgs) {
        this.log(`  - Attempting to verify ${contractName} @ ${address}`, 'white');

        // Slice of 0x if supplied
        if (constructorArgs.startsWith('0x')) {
            constructorArgs = constructorArgs.substr(2);
        }

        const buildInfo = this.buildInfos[buildInfoId];

        if (buildInfo === undefined) {
            this.log(`    - Failed to find relevant build info`, 'red');
            return null;
        }

        let sources;
        try {
            sources = treeShake(buildInfo.input.sources, sourceName);
        } catch (error) {
            this.log(`    - Failed to shake source tree`, 'red');
            console.error(error);
            return false;
        }

        sources = this.applyPreamble(sources);

        const inputJSON = {
            sources,
            language: buildInfo.input.language,
            settings: buildInfo.input.settings,
        };

        return await this.submitVerification(inputJSON, sourceName + ":" + contractName, address, buildInfo.solcLongVersion, constructorArgs);
    }

    getStandardJsonInput(buildInfoId, contractName, sourceName) {
        const buildInfo = this.buildInfos[buildInfoId];

        if (buildInfo === undefined) {
            return null;
        }

        let sources = treeShake(buildInfo.input.sources, sourceName);
        sources = this.applyPreamble(sources);

        return {
            sources,
            language: buildInfo.input.language,
            settings: buildInfo.input.settings,
        };
    }

    applyPreamble(sources) {
        let prefixedSources = {};

        for (let contractPath in sources) {
            // If the path begins with project: then it's one of our files, so add the preamble
            if (contractPath.startsWith('contracts/')) {
                contractPath = contractPath.substring(''.length);
                const content = this.opts.preamble + sources[contractPath].content;
                prefixedSources[contractPath] = { content };
            } else {
                prefixedSources[contractPath] = { content: sources[contractPath].content };
            }
        }

        return prefixedSources;
    }

    async getVerificationStatus(guid) {
        const apiEndpoint = endpointMap[this.opts.chain];
        const result = await axios.get(`${apiEndpoint}?module=contract&action=checkverifystatus&apikey=${this.opts.apiKey}&guid=${guid}`);
        return result.data;
    }

    async isVerified(address) {
        const apiEndpoint = endpointMap[this.opts.chain];
        const result = await axios.get(`${apiEndpoint}?module=contract&action=getabi&apikey=${this.opts.apiKey}&address=${address}`);
        return result.data.status !== '0';
    }

    async submitVerification(inputJSON, contractName, address, compilerVersion, constructorArgs) {
        // Check if it's already verified
        if (await this.isVerified(address)) {
            this.log(`    - Already verified`, 'green');
            return;
        }

        this.log(`    - Submitting to Etherscan`);

        const payload = {
            apikey: this.opts.apiKey,
            module: 'contract',
            action: 'verifysourcecode',
            contractaddress: address,
            sourceCode: JSON.stringify(inputJSON),
            codeformat: 'solidity-standard-json-input',
            contractname: contractName,
            compilerversion: 'v' + compilerVersion,
            optimizationUsed: 0, // unused
            runs: 200, // unused
            evmversion: '', // unused
            constructorArguements: constructorArgs,
            licenseType: this.opts.license,
            libraryname1: '',
            libraryaddress1: '',
            libraryname2: '',
            libraryaddress2: '',
            libraryname3: '',
            libraryaddress3: '',
            libraryname4: '',
            libraryaddress4: '',
            libraryname5: '',
            libraryaddress5: '',
            libraryname6: '',
            libraryaddress6: '',
            libraryname7: '',
            libraryaddress7: '',
            libraryname8: '',
            libraryaddress8: '',
            libraryname9: '',
            libraryaddress9: '',
            libraryname10: '',
            libraryaddress10: '',
        };

        // Submit to API
        const formData = querystring.stringify(payload);
        const result = await axios.post(endpointMap[this.opts.chain], formData);

        // Check result
        if (result.data.status !== '1') {
            this.log(`    - Failed to submit`, 'red');
            console.error(result.data);
            return null;
        } else {
            this.log(`    - GUID:  ${result.data.result}`);
            return result.data.result;
        }
    }
}