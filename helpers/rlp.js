#!/usr/bin/env node

/**
 * Module dependencies.
 */

const $Web3 = require('web3');
const RLP = require('rlp');
const ethUtils = require('ethereumjs-util');
const convert = require('convert-string');

// console.log(convert.stringToBytes('0x9b45a14dfb0d453c4a79bd00db075b6f452fc268cf86c6a6d22d5aca8404af70'));
// console.log(Buffer.from("0x9b45a14dfb0d453c4a79bd00db075b6f452fc268cf86c6a6d22d5aca8404af70", "hex"));

var encodedDog = RLP.encode('dog');
var encodedList = RLP.encode(['1']);
var encodedListSent = $Web3.utils.bytesToHex(encodedList);
var decodedList = RLP.decode(encodedList);
var decodedListSent = RLP.decode(encodedListSent);
/*
console.log(4, encodedDog.length);
console.log(RLP.getLength(encodedDog), 4);
console.log(encodedDog);
console.log(encodedDog[0], 131);
var decodedStr = RLP.decode(Buffer.from([131, 100, 111, 103]))
console.log(3, decodedStr.length);
console.log(decodedStr.toString(), 'dog');
//console.log(ethUtils.rlphash(RLP.encode("dog")));*/
console.log(encodedList);
console.log(encodedList.length);
console.log(encodedList[0]);
console.log(encodedList[1]);
console.log(decodedList);
console.log(decodedList.length);
console.log(decodedListSent.toString());
//console.log($Web3.utils.keccak256(RLP.encode([1])));
