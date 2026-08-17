import "dotenv/config";

import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import type { HardhatUserConfig } from "hardhat/config";
import hardhatIgnoreWarnings from "hardhat-ignore-warnings";

export const mnemonicPhrase =
    process.env.MNEMONIC
    ?? "test test test test test test test test test test test junk";
export const mnemonicPassword = process.env.MNEMONIC_PASSWORD ?? "";
export const providerUrl = process.env.PROVIDER_URL ?? "http://localhost:8545";

export const commonConfig: HardhatUserConfig = {
    plugins: [
        hardhatToolboxMochaEthers,
        hardhatIgnoreWarnings,
    ],
    solidity: {
        compilers: [
            {
                version: "0.7.6",
                settings: {
                    optimizer: {
                        enabled: false,
                    },
                },
            },
            {
                version: "0.8.30",
                settings: {
                    optimizer: {
                        enabled: false,
                    },
                },
            },
        ],
    },
    paths: {
        sources: "./contracts",
        tests: {
            mocha: "./test-entrypoints",
            solidity: "./test-solidity",
        },
        cache: "./cache",
        artifacts: "./artifacts",
    },
    test: {
        mocha: {
            timeout: 0,
        },
        solidity: {
            fuzz: {
                runs: 256,
            },
        },
    },
    typechain: {
        dontOverrideCompile: true,
    },
};

export const productionCompilerConfig = {
    compilers: [
        {
            version: "0.8.30",
            settings: {
                viaIR: true,
                optimizer: {
                    enabled: true,
                    runs: 15_000,
                },
            },
        },
        {
            version: "0.7.6",
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 15_000,
                },
            },
        },
    ],
};

export const warningsConfig = {
    "@openzeppelin/**/*": {
        default: "off",
    },
    "*": {
        "func-mutability": "off",
        "unused-param": "off",
    },
} as const;
