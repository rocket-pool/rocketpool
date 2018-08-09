// Global injected objects
global.artifacts = artifacts;
global.web3 = web3;

// Dependencies
const Web3 = require('web3');
const CasperInstance = require('../../test/_lib/casper/casper.js').CasperInstance;
const signRaw = require('../../test/_lib/utils/sign.js').default;
const getGanachePrivateKey = require('../../test/_lib/utils/general.js').getGanachePrivateKey;
const paddy = require('../../test/_lib/utils/general.js').paddy;


// Artifacts
const RocketNodeValidator = artifacts.require('./contract/RocketNodeValidator');

// Logout minipool
module.exports = async (done) => {

    // Get command-line arguments (remove args from truffle)
    let args = process.argv.splice(4);

    // Validate arguments
    if (args.length != 2) done('Incorrect number of arguments. Please enter: node address, minipool address.');
    if (!Web3.utils.isAddress(args[0])) done('Node address is invalid.');
    if (!Web3.utils.isAddress(args[1])) done('Minipool address is invalid.');

    // Parse arguments
    let [nodeAddress, miniPoolAddress] = args;

    // Get contract dependencies
    const rocketNodeValidator = await RocketNodeValidator.deployed();
    const casper = await CasperInstance();

    // get the current validator index and epoch for logout message
    let validatorIndex = parseInt(await casper.methods.validator_indexes(miniPoolAddress).call({from: nodeAddress}));
    let currentEpoch = parseInt(await casper.methods.current_epoch().call({from: nodeAddress}));

    // build logout message
    let signatureHash = Web3.utils.keccak256(abi.encodePacked(encode([validatorIndex, currentEpoch])));
    let signature = signRaw(signatureHash, getGanachePrivateKey(nodeAddress));
    let combinedSignature = Buffer.from(paddy(signature.v, 64) + paddy(signature.r, 64) +  paddy(signature.s, 64), 'hex');
    let logoutMessage = encode([validatorIndex, currentEpoch, combinedSignature]);

    // Logout
    let result = await rocketNodeValidator.minipoolLogout(miniPoolAddress, '0x' + logoutMessage.toString('hex'), {from: nodeAddress, gas: 1600000});

    // Complete
    done('Minipool successfully logged out: ' + args.join(', '));

};


/**
 * Our own RLP encode implementation because the module is broken when required via truffle.
 * RLP.encode does not recognise input Array type correctly, "input instanceof Array" resolves to false.
 */

function encode (input) {
  if (input instanceof Array) {
    var output = []
    for (var i = 0; i < input.length; i++) {
      output.push(encode(input[i]))
    }
    var buf = Buffer.concat(output)
    return Buffer.concat([encodeLength(buf.length, 192), buf])
  } else {
    input = toBuffer(input)
    if (input.length === 1 && input[0] < 128) {
      return input
    } else {
      return Buffer.concat([encodeLength(input.length, 128), input])
    }
  }
}

function encodeLength (len, offset) {
  if (len < 56) {
    return new Buffer([len + offset])
  } else {
    var hexLength = intToHex(len)
    var lLength = hexLength.length / 2
    var firstByte = intToHex(offset + 55 + lLength)
    return new Buffer(firstByte + hexLength, 'hex')
  }
}

function isHexPrefixed (str) {
  return str.slice(0, 2) === '0x'
}

function stripHexPrefix (str) {
  if (typeof str !== 'string') {
    return str
  }
  return isHexPrefixed(str) ? str.slice(2) : str
}

function intToHex (i) {
  var hex = i.toString(16)
  if (hex.length % 2) {
    hex = '0' + hex
  }

  return hex
}

function padToEven (a) {
  if (a.length % 2) a = '0' + a
  return a
}

function intToBuffer (i) {
  var hex = intToHex(i)
  return new Buffer(hex, 'hex')
}

function toBuffer (v) {
  if (!Buffer.isBuffer(v)) {
    if (typeof v === 'string') {
      if (isHexPrefixed(v)) {
        v = new Buffer(padToEven(stripHexPrefix(v)), 'hex')
      } else {
        v = new Buffer(v)
      }
    } else if (typeof v === 'number') {
      if (!v) {
        v = new Buffer([])
      } else {
        v = intToBuffer(v)
      }
    } else if (v === null || v === undefined) {
      v = new Buffer([])
    } else if (v.toArray) {
      // converts a BN to a Buffer
      v = new Buffer(v.toArray())
    } else {
      throw new Error('invalid type')
    }
  }
  return v
}

