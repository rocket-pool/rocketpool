// Casper functionaility for Rocket Pools unit tests


const $Web3 = require('web3');
const $web3 = new $Web3('http://localhost:8545');
const FS = require('fs');

import { getABI, soliditySha3, mineBlockAmount, getContractAddressFromStorage } from '../utils/general';
import { RocketStorage, RocketUpgrade } from '../artifacts'


// Casper settings
const casperInit = require('../../../contracts/contract/casper/compiled/simple_casper_init.js');

// Load our precompiled casper contract now as web3.eth.contract
async function Casper() {
    return new $web3.eth.Contract(getABI('./contracts/contract/casper/compiled/simple_casper_test.abi'), await getContractAddressFromStorage('casper'));
}

// Initialise the current epoch if possible
async function epochInitialise(fromAddress) {
    // Casper
    const casper = await Casper();
    // Get the current epoch
    let epochCurrent = await casper.methods.current_epoch().call({from: fromAddress});
    // Get the current block number
    let blockCurrent = web3.eth.blockNumber;
    // Get the current epoch length
    let epochBlockLength = await casper.methods.EPOCH_LENGTH().call({from: fromAddress});
    // This would be the current epoch we expect
    let epochExpected = Math.floor(blockCurrent/epochBlockLength);
    // Shall we?
    if(parseInt(epochCurrent) < parseInt(epochExpected)) {
        // Initialise the new epoch now
        await casper.methods.initialize_epoch(parseInt(epochCurrent) + 1).send({from: fromAddress, gas: 1750000, gasPrice: '20000000000'});
        // Check to see the last finalised epoch
        // let epochLastFinalised = await casper.methods.last_finalized_epoch().call({from: fromAddress});
        // console.log(epochLastFinalised, epochExpected);
    }
}

// Load our precompiled casper contract now as web3.eth.contract
export async function CasperInstance() {
    return await Casper();
}

// Increment the current Casper epoch by mining the required blocks needed and initialise new epoch
export async function casperEpochIncrementAmount(fromAddress, amount) {
    // Casper
    const casper = await Casper();
    // Incrementing one at a time
    const incrementEpoch = async function() {
        // Get the current epoch
        let epochCurrent = await casper.methods.current_epoch().call({from: fromAddress});
        // Get the current epoch length
        let epochBlockLength = await casper.methods.EPOCH_LENGTH().call({from: fromAddress});
        // Get the current block number
        let blockCurrent = web3.eth.blockNumber;
        // How many blocks are we passed the last epoch?
        let blocksOver = (blockCurrent - (parseInt(epochBlockLength)*parseInt(epochCurrent)));
        // How many blocks do we need to fast foward for the next epoch?
        let blocksNeeded = (parseInt(epochBlockLength)*1) - blocksOver;
        // Lets mine those blocks now and initialise the new epoch when we are there
        await mineBlockAmount(blocksNeeded);
        // Initialise the new epoch
        await epochInitialise(fromAddress);
    }
    // Do as many as required - have to be inside an async loop
    const loop = async function() {
        for(let i=0; i < amount; i++) {
            await incrementEpoch();
        }
    };
    // Run it
    await loop();
}

// Initialise the current epoch if needed
export async function casperEpochInitialise(fromAddress) {
    // Initialise the new epoch if possible
    await epochInitialise(fromAddress);
}


// Deploy a new and fresh instance of Casper for each contract unit test that requires it, this automatically creates the correct epoch for Casper to start from
// NOTE: Not currently used anymore, will remove when 100% sure its no longer needed
/*
export async function init({owner}) {

    // Deploy Casper and related contracts
    const deployContracts = async () => {

        // Get our RocketStorage
        const rocketStorageInstance = await RocketStorage.deployed();
        const rocketUpgradeInstance = await RocketUpgrade.deployed();
        
        // Precompiled - Casper
        const casper = new $web3.eth.Contract(getABI('./contracts/contract/casper/compiled/simple_casper.abi'), null, {
            from: owner, 
            gasPrice: '20000000000' // 20 gwei
        });
        // Deploy Casper
        let casperContract = await casper.deploy(
          // Casper settings 
          { arguments: casperInit.init(
              owner, 
              await rocketStorageInstance.getAddress(soliditySha3('contract.name', 'sigHasher')), 
              await rocketStorageInstance.getAddress(soliditySha3('contract.name', 'purityChecker')), 
              web3.toWei('5', 'ether')
          ),
            data: FS.readFileSync('./contracts/contract/casper/compiled/simple_casper.bin')
          }).send({from: owner, gas: 5000000, gasPrice: '20000000000'});
          
         // Set Caspers address 
         await rocketUpgradeInstance.upgradeContract('casper', casperContract._address, true, true);    

         console.log(casperContract._address);

    }

    // Redeploy now
    deployContracts();

}*/
