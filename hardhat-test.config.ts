import { defineConfig } from "hardhat/config";

import baseConfig from "./hardhat.config.js";

const baseTestPaths = typeof baseConfig.paths?.tests === "object"
    ? baseConfig.paths.tests
    : {};

export default defineConfig({
    ...baseConfig,
    paths: {
        ...baseConfig.paths,
        tests: {
            ...baseTestPaths,
            mocha: "./test/tests",
        },
    },
});
