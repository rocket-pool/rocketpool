const ethers = require('ethers');
const assert = require('node:assert');

function toLittleEndian(value) {
    let v = BigInt(value);
    const result = new Uint8Array(32);
    for (let i = 0; i < result.length; ++i) {
        result[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return ethers.hexlify(result);
}

function packUint64s(values) {
    assert.equal(values.length, 4);
    const result = new Uint8Array(32);
    values.forEach((value, lane) => {
        let v = BigInt(value);
        for (let byte = 0; byte < 8; ++byte) {
            result[lane * 8 + byte] = Number(v & 0xffn);
            v >>= 8n;
        }
        assert.equal(v, 0n, 'Packed value exceeds uint64');
    });
    return ethers.hexlify(result);
}

function sha256Pair(left, right) {
    return ethers.sha256(ethers.concat([left, right]));
}

function makeWitnesses(length) {
    return Array.from({ length }, (_, i) => ethers.zeroPadValue(ethers.toBeHex(i + 1), 32));
}

function progressivePath(index) {
    let remaining = BigInt(index);
    let groupSize = 1n;
    let groupDepth = 0;
    let path = '0';
    while (remaining >= groupSize) {
        remaining -= groupSize;
        path += '1';
        groupSize *= 4n;
        groupDepth += 2;
    }
    const offset = groupDepth === 0 ? '' : remaining.toString(2).padStart(groupDepth, '0');
    return path + '0' + offset;
}

// Builds independent single-leaf witnesses for several leaves in one synthetic
// tree. This lets the versioned bundle prove all of its facts against one root.
function makeMultiProofs(leaves) {
    const leafMap = new Map(leaves.map(({ path, leaf }) => [path, leaf]));
    const paths = [...leafMap.keys()];
    for (const path of paths) {
        assert.equal(paths.some(other => other !== path && other.startsWith(path)), false, 'Proof leaf is an ancestor');
    }

    const nodes = new Map();
    function node(prefix) {
        if (nodes.has(prefix)) return nodes.get(prefix);
        if (leafMap.has(prefix)) return leafMap.get(prefix);
        if (!paths.some(path => path.startsWith(prefix))) {
            return ethers.sha256(ethers.toUtf8Bytes(`unused:${prefix}`));
        }
        const value = sha256Pair(node(prefix + '0'), node(prefix + '1'));
        nodes.set(prefix, value);
        return value;
    }

    const witnesses = new Map();
    for (const path of paths) {
        const proof = [];
        for (let i = path.length - 1; i >= 0; --i) {
            const sibling = path.slice(0, i) + (path[i] === '0' ? '1' : '0');
            proof.push(node(sibling));
        }
        witnesses.set(path, proof);
    }
    return { root: node(''), witnesses };
}

function restoreRoot(leaf, path, witnesses) {
    let gindex = BigInt(`0b1${path}`);
    let value = leaf;
    for (const witness of witnesses) {
        value = gindex % 2n === 1n ? sha256Pair(witness, value) : sha256Pair(value, witness);
        gindex /= 2n;
    }
    assert.equal(gindex, 1n);
    return value;
}

function merkleiseValidator(validator) {
    const pubkey = ethers.getBytes(validator.pubkey);
    const pubkeyRoot = sha256Pair(
        ethers.hexlify(pubkey.slice(0, 32)),
        ethers.hexlify(new Uint8Array([...pubkey.slice(32), ...new Uint8Array(16)])),
    );
    const a = sha256Pair(pubkeyRoot, validator.withdrawalCredentials);
    const b = sha256Pair(toLittleEndian(validator.effectiveBalance), toLittleEndian(validator.slashed ? 1 : 0));
    const c = sha256Pair(toLittleEndian(validator.activationEligibilityEpoch), toLittleEndian(validator.activationEpoch));
    const d = sha256Pair(toLittleEndian(validator.exitEpoch), toLittleEndian(validator.withdrawableEpoch));
    return sha256Pair(sha256Pair(a, b), sha256Pair(c, d));
}

function merkleiseWithdrawal(withdrawal) {
    const addressRoot = ethers.hexlify(new Uint8Array([
        ...ethers.getBytes(withdrawal.withdrawalCredentials),
        ...new Uint8Array(12),
    ]));
    return sha256Pair(
        sha256Pair(toLittleEndian(withdrawal.index), toLittleEndian(withdrawal.validatorIndex)),
        sha256Pair(addressRoot, toLittleEndian(withdrawal.amountInGwei)),
    );
}

module.exports = { toLittleEndian, packUint64s, sha256Pair, makeWitnesses, progressivePath, makeMultiProofs, restoreRoot, merkleiseValidator, merkleiseWithdrawal };
