import { sign as secp256k1_sign } from 'secp256k1';
import { addTrailing0x, removeTrailing0x } from './general';

/**
 * signs the given message
 * we do not use sign from eth-lib because the pure secp256k1-version is 90% faster
 * @param  {string} hash
 * @param  {string} privateKey
 * @return {object} signature, v, r, s
 */
export default function (hash, privateKey) {
    hash = addTrailing0x(hash);
    if (hash.length !== 66)
        throw new Error('sign(): Can only sign hashes, given: ' + hash);

    const sigObj = secp256k1_sign(
        new Buffer(removeTrailing0x(hash), 'hex'),
        new Buffer(removeTrailing0x(privateKey), 'hex')
    );

    const recoveryId = sigObj.recovery === 1 ? '1c' : '1b';
    const sig = sigObj.signature.toString('hex') + recoveryId;

    const v = sig.slice(128,130);
    const r = sig.slice(0,64);
    const s = sig.slice(64,128);
    
    return {
        sig,
        v,
        r,
        s
    };
}
