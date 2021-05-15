// Take a snapshot of the EVM state
export function takeSnapshot(web3) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_snapshot',
            id: (new Date()).getTime(),
        }, function(err, response) {
            if (err) { reject(err); }
            else if (response && response.result) { resolve(response.result); }
            else { reject('Unknown error'); }
        });
    });
}


// Restore a snapshot of EVM state
export function revertSnapshot(web3, snapshotId) {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_revert',
            params: [snapshotId],
            id: (new Date()).getTime(),
        }, function(err, response) {
            if (err) { reject(err); }
            else { resolve(); }
        });
    });
}


// Mine a number of blocks
export async function mineBlocks(web3, numBlocks) {
    for (let i = 0; i < numBlocks; ++i) {
        await new Promise((resolve, reject) => {
            web3.currentProvider.send({
                jsonrpc: '2.0',
                method: 'evm_mine',
                id: (new Date()).getTime(),
            }, function(err, response) {
                if (err) { reject(err); }
                else { resolve(); }
            });
        });
    }
}

// Fast-forward time
export async function increaseTime(web3, seconds) {
    await new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [seconds],
            id: (new Date()).getTime(),
        }, function(err, response) {
            if (err) { reject(err); }
            else { resolve(); }
        });
    });
    // Mine a block using the new time
    await mineBlocks(web3, 1);
}

// Retrieve current time on block chain
export async function getCurrentTime(web3) {
    return (await web3.eth.getBlock('latest')).timestamp
}