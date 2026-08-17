import {
    after as mochaAfter,
    afterEach as mochaAfterEach,
    before as mochaBefore,
    beforeEach as mochaBeforeEach,
    describe as mochaDescribe,
    it as mochaIt,
} from "mocha";

import {
    disposeHarnessBaseline,
    HarnessScope,
    initializeHarnessBaseline,
} from "./scope";
import {
    disposeHardhatRuntime,
    initialiseTestRuntime,
} from "../../test-old/_utils/hardhat-runtime";

type Hook = (this: Mocha.Context) => Promise<unknown> | unknown;
type Test = (this: Mocha.Context) => Promise<unknown> | unknown;
type DescribeCallback = () => void;

const definitionStack: HarnessScope[] = [];

mochaBefore(async function() {
    await initialiseTestRuntime();
    await initializeHarnessBaseline();
});

mochaAfter(async function() {
    await disposeHarnessBaseline();
    await disposeHardhatRuntime();
});

function currentDefinitionScope(): HarnessScope {
    const scope = definitionStack[definitionStack.length - 1];
    if (!scope) {
        throw new Error("Harness before/it must be declared inside a harness describe");
    }
    return scope;
}

function buildDescribe(base: any): Mocha.SuiteFunction {
    const wrapped = function(title: string, callback: DescribeCallback): Mocha.Suite {
        return base(title, function() {
            const parent = definitionStack[definitionStack.length - 1] ?? null;
            const scope = new HarnessScope(title, parent);

            mochaBefore(async function() {
                await scope.enter();
            });
            mochaBeforeEach(async function() {
                if (this.currentTest?.parent === this.test?.parent) {
                    await scope.beginTest();
                }
            });

            definitionStack.push(scope);
            try {
                callback();
            } finally {
                definitionStack.pop();
            }

            mochaBefore(async function() {
                await scope.captureBaseline();
            });
            mochaAfterEach(async function() {
                if (this.currentTest?.parent === this.test?.parent) {
                    await scope.endTest();
                }
            });
            mochaAfter(async function() {
                await scope.leave();
            });
        });
    } as Mocha.SuiteFunction;
    return wrapped;
}

export const describe = buildDescribe(mochaDescribe);
describe.only = buildDescribe(mochaDescribe.only);
describe.skip = buildDescribe(mochaDescribe.skip);

export function before(callback: Hook): void {
    const scope = currentDefinitionScope();
    mochaBefore(function() {
        return scope.runSetup(() => callback.call(this));
    });
}

export function it(title: string, callback: Test): Mocha.Test {
    const scope = currentDefinitionScope();
    return mochaIt(title, function() {
        return scope.runTest(() => callback.call(this));
    });
}

it.only = function(title: string, callback: Test): Mocha.Test {
    const scope = currentDefinitionScope();
    return mochaIt.only(title, function() {
        return scope.runTest(() => callback.call(this));
    });
};

it.skip = function(title: string, callback?: Test): Mocha.Test {
    const scope = currentDefinitionScope();
    return mochaIt.skip(title, callback && function() {
        return scope.runTest(() => callback.call(this));
    });
};
