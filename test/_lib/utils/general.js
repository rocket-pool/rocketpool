const moment = require('moment');
import { RocketStorage } from '../artifacts'

// The newer version of Web3. Waiting for them to upgrade truffles web3.
const $web3 = require('web3');
const FS = require('fs');
const ethUtils = require('ethereumjs-util');


// Print pretty test title
export function printTitle(user, desc) {
    return '\x1b[33m' + user + '\u001b[00m: \u001b[01;34m' + desc;
}

export function floorDiv(a,b) {
    var result = a/b;
    if(result>=0)
        return Math.floor(result);
    else
        return Math.ceil(result);
}

// Assert that an error is thrown
export async function assertThrows(promise, err) {
    try {
        await promise;
        assert.isNotOk(true, err);
    } catch (e) {
        assert.include(e.message, 'VM Exception');
    }
}

// RLP encode the given array argument
export function rlpEncode (argArray) {
    return ethUtils.rlphash(argArray);
}

// Get the gananche-cli private key
export function getGanachePrivateKey (account) {
    account = !account ? '0xe6ed92d26573c67af5eca7fb2a49a807fb8f88d' : account;
    const pkeys = {
        '0xe6ed92d26573c67af5eca7fb2a49a807fb8f88db' : 'c6d2ac9b00bd599c4ce9d3a69c91e496eb9e79781d9dc84c79bafa7618f45f37',
        '0x18a58e43c37ddc9cccf3ac642c6f430ad663e400' : '025515b79bbe5edf008112d19a14457e6bea72dc4660667eeb2c3225c8285618',
        '0x7e9ea400443957be3918acfbd1f57cf6d3f5126a' : '02984e048155b5a3b80162a2041e096c3f99b9b4324bc7ff3e56e96d37f1500b',
        '0x24fbed7ecd625d3f0fd19a6c9113ded436172294' : '5894075a2b08d7585fd4b354914326da5c9b05f92a737b8789f127ba7a21f939',
        '0x14cb2253a2f9898efa43b9ca15bcfde401ccfbe7' : '5a18d98ff88545ab82044b31ace49ad252056b89445913dc6a5653eca58c438a',
        '0x8b0ef9f1932a2e44c3d27be4c70c3bc07a6a27b3' : 'ea8a7f5637ca1ae8ee6783850af1c0c57cdc5e66d1dcb92fd636908ad9b4cc04',
        '0x822eaeebb9e106c8cb263bda6455430fec652653' : '836915de8841cd4e3a24b80c9c33e59be8db8ab3daf32d5edce56597b905bbf0',
        '0xd57d9c08926e28fc9f1f3dd65db02e6a7958380c' : '759b3437ff0fd1af70a5a367ac281c73f6dca2e17a4650a7f939fb50ad15f6cd',
        '0x6f10fd508321d27d8f19cbcc2f2f3d5527b637ec' : 'dde1c7fcfe3fa4c5e824e2e0cf5d8cef98692cde611b070d054045c2826aecb4',
        '0x421433c3f99529a704ec2270e1a68fa66dd8bd79' : '418bb76e4af529837d39f4812201c6e4b9b3d5d521f66047b6f34a6d7bc0c811'
    }

    // Known private keys because we start ganache with mnemonic "jungle neck govern chief unaware rubber frequent tissue service license alcohol velvet"
    return pkeys[account];
}


// Get the ABI file - used for precompiled contracts
export function getABI (abiFilePath) {
    return JSON.parse(FS.readFileSync(abiFilePath));
}

// Get the address of a registered RP contract
export async function getContractAddressFromStorage (contractName) {
    // Contract dependencies
    let rocketStorage = await RocketStorage.deployed()
    return await rocketStorage.getAddress(soliditySha3('contract.name', contractName), {gas: 250000});
}

// Print the event to console
export function printEvent (type, result, colour) {
  console.log('\n');
  console.log(
    colour,
    '*** ' + type.toUpperCase() + ' EVENT: ' + result.event + ' *******************************'
  );
  console.log('\n');
  console.log(result.args);
  console.log('\n');
};

//  New web3 is used for hashing, the old one that comes with truffle does it incorrectly.
export function soliditySha3() {
    return $web3.utils.soliditySha3.apply($web3, Array.prototype.slice.call(arguments));
}

// Mine multiple blocks - used primarily for advancing Casper epochs
export async function mineBlockAmount(blockAmount) {
    const mineOneBlock = async () => {
        await web3.currentProvider.send({
          jsonrpc: '2.0',
          method: 'evm_mine',
          params: [],
          id: 0,
        })
      }
    for (let i = 0; i < blockAmount; i++) {
        await mineOneBlock();
    }
}

// Address formatting tools
export function removeTrailing0x(str) {
    if (str.startsWith('0x'))
        return str.substring(2);
    else return str;
}

export function addTrailing0x(str) {
    if (!str.startsWith('0x'))
        return '0x' + str;
    else return str;
}

// Pads a string to a certain length
export function paddy(string, padlen, padchar) {
    string = string.substr(0, 2) == '0x' ? string.slice(2) : string;
    var pad_char = typeof padchar !== 'undefined' ? padchar : '0';
    var pad = new Array(1 + padlen).join(pad_char);
    return (pad + string).slice(-pad.length);
}

const ethereumUtils = require('ethereumjs-util');
export function hashMessage(data) {
    var message = $web3.utils.isHexStrict(data) ? $web3.utils.hexToBytes(data) : data;
    var messageBuffer = Buffer.from(message);
    var preamble = "\x19Ethereum Signed Message:\n" + message.length;
    var preambleBuffer = Buffer.from(preamble);    
    var ethMessage = Buffer.concat([preambleBuffer, messageBuffer]);
    return $web3.utils.bytesToHex(ethereumUtils.sha3(ethMessage));
}

// EVM time controller
export const TimeController = (() => {

    let currentTime = moment();

    const addSeconds = (seconds) => new Promise((resolve, reject) => {
        
        currentTime.add(seconds, 'seconds');

        web3.currentProvider.send(
            {
                jsonrpc: "2.0",
                method: "evm_increaseTime",
                params: [seconds],
                id: currentTime.valueOf()
            }, 
            (error, result) => error ? reject(error) : resolve(result.result)
        );
    });

    const getCurrentTime = () => currentTime.clone();
    const reset = () => { currentTime = moment(); };
    const addDays = (days) => addSeconds(days * 24 * 60 * 60);
    const addWeeks = (weeks) => addSeconds(weeks * 7 * 24 * 60 * 60);
    const addMonths = (months) => addSeconds(months * 28 * 24 * 60 * 60);
    const addYears = (years) => addSeconds(years * 365 * 24 * 60 * 60);

    return {
        getCurrentTime,
        reset,
        addSeconds,
        addDays,
        addWeeks,
        addMonths,
        addYears,
    };

})();


// Get arbitrary contract events from a transaction result
// txResult is the result returned from the transaction call
// contractAddress is the address of the contract to retrieve events for
// eventName is the name of the event to retrieve
// eventParams is an array of objects with string 'type' and 'name' keys and an optional boolean 'indexed' key
export function getTransactionContractEvents(txResult, contractAddress, eventName, eventParams) {
    return txResult.receipt.rawLogs
        .filter(log => (log.address.toLowerCase() == contractAddress.toLowerCase()))
        .filter(log => (log.topics[0] == web3.utils.soliditySha3(eventName + '(' + eventParams.map(param => param.type).join(',') + ')')))
        .map(log => web3.eth.abi.decodeLog(eventParams.map(param => {
            let decodeParam = Object.assign({}, param);
            if (decodeParam.indexed && (decodeParam.type == 'string' || decodeParam.type == 'bytes')) decodeParam.type = 'bytes32'; // Issues decoding indexed string and bytes parameters
            return decodeParam;
        }), log.data, log.topics.slice(1)));
}


// Repeatedly hash a value n times
export function repeatHash(value, n) {
    let ret = value;
    for (let i = 0; i < n; ++i) {
        ret = web3.utils.sha3(ret);
    }
    return ret;
}

