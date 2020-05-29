// Assert that a transaction reverts
export async function shouldRevert(txPromise, message) {
    try {
        await txPromise;
        throw new Error('tx_success');
    } catch (e) {
        if (e.message == 'tx_success') {
            assert.fail(message);
        } else if (e.message.indexOf('VM Exception') == -1) {
            throw e;
        }
    }
}
