import { defineConfig } from "hardhat/config";

import {
    commonConfig,
    mnemonicPassword,
    mnemonicPhrase,
    providerUrl,
    warningsConfig,
} from "./hardhat-common.config.js";

export default defineConfig({
    ...commonConfig,
    networks: {
        hardhat: {
            type: "edr-simulated",
            chainType: "l1",
            allowUnlimitedContractSize: true,
            accounts: {
                count: 50,
                accountsBalance: 10_000_000n * 10n ** 18n,
            },
        },
        localhost: {
            type: "http",
            chainType: "l1",
            url: "http://127.0.0.1:8545",
            accounts: "remote",
        },
        custom: {
            type: "http",
            chainType: "l1",
            url: providerUrl,
            accounts: {
                mnemonic: mnemonicPhrase,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 1,
                passphrase: mnemonicPassword,
            },
        },
    },
    warnings: warningsConfig,
});
