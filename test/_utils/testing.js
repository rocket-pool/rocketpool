// Assert that a transaction reverts
import * as assert from 'assert';

export async function shouldRevert(txPromise, message, expectedErrorMessage = null) {
    let txSuccess = false;
    try {
        await txPromise;
        txSuccess = true;
    } catch (e) {
        // With --via-ir flag, hardhat sometimes can't get the error message
        if (e.message.indexOf('Transaction reverted and Hardhat couldn\'t infer the reason') !== -1) return;
        // If we don't need to match a specific error message
        if (!expectedErrorMessage && e.message.indexOf('VM Exception') === -1) throw e;
        // If we do
        if (expectedErrorMessage && e.message.indexOf(expectedErrorMessage) === -1) assert.fail('Expected error message not found, error received: ' + e.message.replace('Returned error:', ''));
    } finally {
        if (txSuccess) assert.fail(message);
    }
}

// Allows async describe functions
export default async function asyncDescribe(desc, run) {
    const its = {};

    return run((testName, func) => {
        its[testName] = func;
    }).then(() => {
        describe(desc, () => {
            for (const [testName, runFunction] of Object.entries(its)) {
                it(testName, runFunction);
            }
        });
    });
}