#!/usr/bin/env node

/**
 * Estimates the gas requirment for deploying a contract
 */

var config = require('../node/node-env-settings.js');
var Web3 = require('web3');
var fs = require("fs");
var jsonfile = require('jsonfile');
var jsonQuery = require('json-query')
var program = require('commander');

// Set the command parameters
program
  .version('0.0.1')
  .option('-c, --contract [accountIndex]', 'The contract to estimate gas dexployment use on!')
  .parse(process.argv);
  
// Initialise web3
var web3Provider = new Web3.providers.HttpProvider(config.settings.provider);
web3 = new Web3(web3Provider);

// Our precompiled contracts
var json = '../bin/contracts/'+program.contract+'.json';
var contractJson = JSON.parse(fs.readFileSync(json, 'utf8'));

// Store our results so we can compare
var jsonGasFile = './gas-estimate-deploy-contract.json';

// Start now
if (web3.isConnected()) {

    // See if we have a previous result for this contract to compare
    var jsonData = jsonfile.readFileSync(jsonGasFile);
    var jsonFilter = jsonQuery('**[contract=' + program.contract + ']', {
        data: jsonData
    });
    var previousGas = jsonFilter.references[0].deploymentGas;

    var info = web3.eth.getBlock('latest');
    var gasEstimate = web3.eth.estimateGas({ data: contractJson.bytecode, gas: info.gasLimit }); // Max Gas Block Limit, cannot exceed this
    console.log('Current Gas: ' + gasEstimate);
    if (previousGas) {
        var gasDiff = gasEstimate - previousGas;
        console.log('Previous Gas: ' + previousGas);
        if (gasDiff < 0) {
            console.log('SAVED GAS =  ' + Math.abs(gasDiff));
        } else {
            console.log('GAS INCREASED =  ' + gasDiff);
        }
    }
    
    // Write it    
    var obj = { contract: program.contract, deploymentGas: gasEstimate };
    jsonfile.writeFile(jsonGasFile, obj, function (err) {
        if (err) {
            console.error("Error saving gas results");
        }
    });

}


