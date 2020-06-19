// Assert that a transaction reverts
export async function shouldRevert(txPromise, message) {
    let txSuccess = false;
    try {
        await txPromise;
        txSuccess = true;
    } catch (e) {
        if (e.message.indexOf('VM Exception') == -1) throw e;
    } finally {
        if (txSuccess) assert.fail(message);
    }
}
