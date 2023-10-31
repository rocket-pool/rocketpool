const _assertBN = {
    equal: function (actual, expected, message) {
        assert.strictEqual(web3.utils.toBN(actual).toString(), web3.utils.toBN(expected).toString(), message);
    },
    notEqual: function (actual, expected, message) {
        assert.notEqual(web3.utils.toBN(actual).toString(), web3.utils.toBN(expected).toString(), message);
    },
    isBelow: function (actual, n, message) {
        assert(web3.utils.toBN(actual).lt(web3.utils.toBN(n)), message);
    },
    isAbove: function (actual, n, message) {
        assert(web3.utils.toBN(actual).gt(web3.utils.toBN(n)), message);
    },
    isAtMost: function (actual, n, message) {
        assert(web3.utils.toBN(actual).lte(web3.utils.toBN(n)), message);
    },
    isAtLeast: function (actual, n, message) {
        assert(web3.utils.toBN(actual).gte(web3.utils.toBN(n)), message);
    },
    isZero: function (actual, message) {
        assert.strictEqual(web3.utils.toBN(actual).toString(), '0'.BN.toString(), message);
    },
}

export function injectBNHelpers() {
    String.prototype.__defineGetter__('ether', function () {
        return web3.utils.toBN(web3.utils.toWei(this));
    });
    String.prototype.__defineGetter__('gwei', function () {
        return web3.utils.toBN(web3.utils.toWei(this, 'gwei'));
    });
    String.prototype.__defineGetter__('BN', function () {
        return web3.utils.toBN(this);
    });
    Number.prototype.__defineGetter__('BN', function () {
        return web3.utils.toBN(this.toString());
    });
    Number.prototype.__defineGetter__('ether', function () {
        return web3.utils.toBN(web3.utils.toWei(this.toString()));
    });
    Number.prototype.__defineGetter__('gwei', function () {
        return web3.utils.toBN(web3.utils.toWei(this.toString(), 'gwei'));
    });
}

export const assertBN = _assertBN;

