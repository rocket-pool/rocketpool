#!/usr/bin/env node

/**
 * Module dependencies.
 */

const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');
const RLP = require('rlp');
const secp256k1 = require('secp256k1');
const EthCrypto = require('eth-crypto');

// Sign
function signRaw(hash, privateKey) {
    hash = addTrailing0x(hash);
    if (hash.length !== 66)
        throw new Error('sign(): Can only sign hashes, given: ' + hash);

    const sigObj = secp256k1.sign(
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

// Address formatting tools
function removeTrailing0x(str) {
    if (str.startsWith('0x'))
        return str.substring(2);
    else return str;
}

function addTrailing0x(str) {
    if (!str.startsWith('0x'))
        return '0x' + str;
    else return str;
}

function paddy(string, padlen, padchar) {
    string = string.substr(0, 2) == '0x' ? string.slice(2) : string;
    var pad_char = typeof padchar !== 'undefined' ? padchar : '0';
    var pad = new Array(1 + padlen).join(pad_char);
    return (pad + string).slice(-pad.length);
}


let validatorIndex = 1;
//let targetHash = "0x9b55f7a0b2fb3a5446becf58e5aa9829a019037f476107786fde41699d4c932a";
let targetHash = Buffer.from('9f89849f28a87af0becb13abca1a47a05486be849c9b528529dfc14a33b1fa4c', 'hex');
let casperCurrentEpoch = 7;
let sourceEpoch = 6;
let pkey = '025515b79bbe5edf008112d19a14457e6bea72dc4660667eeb2c3225c8285618';
// RLP encode the required vote message
let sigHash = $web3.utils.keccak256(RLP.encode([validatorIndex,targetHash,casperCurrentEpoch,sourceEpoch]));

const signatureOb = signRaw(
    sigHash, // hash of message
    pkey, // privateKey
);

const publicKey = EthCrypto.publicKeyByPrivateKey(
    pkey
);

const signer = EthCrypto.recover(
    signatureOb.sig,
    sigHash // signed message hash
);


 // Combine and pad too 32 int length (same as casper python code)
 let combinedSig = paddy(signatureOb.v, 64) + paddy(signatureOb.r, 64) +  paddy(signatureOb.s, 64);
 let voteMessage = RLP.encode([validatorIndex, targetHash, casperCurrentEpoch, sourceEpoch, Buffer.from(combinedSig, 'hex')]);



async function logs() { 
    console.log(combinedSig);
    console.log("\n");
    console.log(voteMessage.toString('hex'));
    console.log("\n");
    /*
    console.log(paddy(signatureOb.v, 64));
    console.log(paddy(signatureOb.r, 64));
    console.log(paddy(signatureOb.s, 64));
    console.log(paddy(signatureOb.v, 64) + paddy(signatureOb.r, 64) + paddy(signatureOb.s, 64));
    */
    console.log("\n");
}
logs();
