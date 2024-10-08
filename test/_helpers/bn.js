import * as assert from 'assert';

const hre = require('hardhat');
const ethers = hre.ethers;

const _assertBN = {
    equal: function (actual, expected, message) {
        assert.strictEqual(actual, BigInt(expected), message);
    },
    notEqual: function (actual, expected, message) {
        assert.notEqual(actual, BigInt(expected), message);
    },
    isBelow: function (actual, n, message) {
        assert.equal(actual < BigInt(n), true, message);
    },
    isAbove: function (actual, n, message) {
        assert.equal(actual > BigInt(n), true, message);
    },
    isAtMost: function (actual, n, message) {
        assert.equal(actual <= BigInt(n), true, message);
    },
    isAtLeast: function (actual, n, message) {
        assert.equal(actual >= BigInt(n), true, message);
    },
    isZero: function (actual, message) {
        assert.strictEqual(actual, 0n, message);
    },
}

export function injectBNHelpers() {
    String.prototype.__defineGetter__('ether', function () {
        return ethers.parseUnits(this, 'ether');
    });
    String.prototype.__defineGetter__('gwei', function () {
        return ethers.parseUnits(this, 'gwei');
    });
    String.prototype.__defineGetter__('BN', function () {
        return BigInt(this);
    });
    Number.prototype.__defineGetter__('BN', function () {
        return BigInt(this);
    });
    Number.prototype.__defineGetter__('ether', function () {
        return ethers.parseUnits(this.toString(), 'ether');
    });
    Number.prototype.__defineGetter__('gwei', function () {
        return ethers.parseUnits(this.toString(), 'gwei');
    });
}

export const assertBN = _assertBN;

