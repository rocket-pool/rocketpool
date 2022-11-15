const _assertBN = {
    equal: function (actual, expected, message) {
        assert.strictEqual(web3.utils.fromWei(web3.utils.toBN(actual)), web3.utils.fromWei(web3.utils.toBN(expected)), message);
    },
    notEqual: function (actual, expected, message) {
        assert.notEqual(web3.utils.fromWei(web3.utils.toBN(actual)), web3.utils.fromWei(web3.utils.toBN(expected)), message);
    },
}

export const assertBN = _assertBN;