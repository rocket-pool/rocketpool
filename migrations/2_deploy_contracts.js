/*** Dependencies ********************/
const pako = require('pako');


/*** Settings ************************/
const config = require('../truffle.js');


// Check if testing utility contracts
const testScript = process.argv[process.argv.length - 1];
const testUtils = !!testScript.match(/util/i);


/*** Contracts ***********************/
// Storage
const rocketStorage = artifacts.require('./RocketStorage.sol');
// All other contracts
const contracts = {};
// ABIs for deployment
const abis = {};
// Core
contracts.rocketAdmin = artifacts.require('./RocketAdmin.sol');
contracts.rocketPool = artifacts.require('./RocketPool.sol');
contracts.rocketRole = artifacts.require('./RocketRole.sol');
contracts.rocketNode = artifacts.require('./RocketNode.sol');
contracts.rocketPIP = artifacts.require('./RocketPIP.sol');
contracts.rocketUpgrade = artifacts.require('./RocketUpgrade.sol');
contracts.rocketUpgradeApproval = artifacts.require('./RocketUpgradeApproval.sol');
// API
contracts.rocketDepositAPI = artifacts.require('./api/RocketDepositAPI.sol');
contracts.rocketGroupAPI = artifacts.require('./api/RocketGroupAPI.sol');
contracts.rocketNodeAPI = artifacts.require('./api/RocketNodeAPI.sol');
// Deposit
contracts.rocketDeposit = artifacts.require('./deposit/RocketDeposit.sol');
contracts.rocketDepositIndex = artifacts.require('./deposit/RocketDepositIndex.sol');
contracts.rocketDepositQueue = artifacts.require('./deposit/RocketDepositQueue.sol');
contracts.rocketDepositVault = artifacts.require('./deposit/RocketDepositVault.sol');
// Group
contracts.rocketGroupAccessorFactory = artifacts.require('./group/RocketGroupAccessorFactory.sol');
// Node
contracts.rocketNodeFactory = artifacts.require('./node/RocketNodeFactory.sol');
contracts.rocketNodeKeys = artifacts.require('./node/RocketNodeKeys.sol');
contracts.rocketNodeTasks = artifacts.require('./node/RocketNodeTasks.sol');
contracts.rocketNodeWatchtower = artifacts.require('./node/RocketNodeWatchtower.sol');
// Minipool
contracts.rocketMinipoolDelegateNode = artifacts.require('./minipool/RocketMinipoolDelegateNode.sol');
contracts.rocketMinipoolDelegateStatus = artifacts.require('./minipool/RocketMinipoolDelegateStatus.sol');
contracts.rocketMinipoolDelegateDeposit = artifacts.require('./minipool/RocketMinipoolDelegateDeposit.sol');
contracts.rocketMinipoolFactory = artifacts.require('./minipool/RocketMinipoolFactory.sol');
contracts.rocketMinipoolSet = artifacts.require('./minipool/RocketMinipoolSet.sol');
// Settings
contracts.rocketMinipoolSettings = artifacts.require('./settings/RocketMinipoolSettings.sol');
contracts.rocketDepositSettings = artifacts.require('./settings/RocketDepositSettings.sol');
contracts.rocketGroupSettings = artifacts.require('./settings/RocketGroupSettings.sol');
contracts.rocketNodeSettings = artifacts.require('./settings/RocketNodeSettings.sol');
// Dummy Contracts
contracts.rocketPoolToken = artifacts.require('./token/DummyRocketPoolToken.sol');
contracts.rocketETHToken = artifacts.require('./token/RocketETHToken.sol');
// Node tasks
contracts.taskDisableInactiveNodes = artifacts.require('./tasks/DisableInactiveNodes.sol');
contracts.taskCalculateNodeFee = artifacts.require('./tasks/CalculateNodeFee.sol');
// Utilities
contracts.utilMaths = artifacts.require('./utils/Maths.sol');
contracts.utilPublisher = artifacts.require('./Publisher.sol');
contracts.utilAddressQueueStorage = artifacts.require('./AddressQueueStorage.sol');
contracts.utilBytes32QueueStorage = artifacts.require('./Bytes32QueueStorage.sol');
contracts.utilAddressSetStorage = artifacts.require('./AddressSetStorage.sol');
contracts.utilBytes32SetStorage = artifacts.require('./Bytes32SetStorage.sol');
contracts.utilStringSetStorage = artifacts.require('./StringSetStorage.sol');
// Extra utilities
if (testUtils) {
  contracts.utilAddressListStorage = artifacts.require('./AddressListStorage.sol');
  contracts.utilBoolListStorage = artifacts.require('./BoolListStorage.sol');
  contracts.utilBytesListStorage = artifacts.require('./BytesListStorage.sol');
  contracts.utilBytes32ListStorage = artifacts.require('./Bytes32ListStorage.sol');
  contracts.utilIntListStorage = artifacts.require('./IntListStorage.sol');
  contracts.utilStringListStorage = artifacts.require('./StringListStorage.sol');
  contracts.utilUintListStorage = artifacts.require('./UintListStorage.sol');
  contracts.utilBoolQueueStorage = artifacts.require('./BoolQueueStorage.sol');
  contracts.utilBytesQueueStorage = artifacts.require('./BytesQueueStorage.sol');
  contracts.utilIntQueueStorage = artifacts.require('./IntQueueStorage.sol');
  contracts.utilStringQueueStorage = artifacts.require('./StringQueueStorage.sol');
  contracts.utilUintQueueStorage = artifacts.require('./UintQueueStorage.sol');
  contracts.utilBoolSetStorage = artifacts.require('./BoolSetStorage.sol');
  contracts.utilBytesSetStorage = artifacts.require('./BytesSetStorage.sol');
  contracts.utilIntSetStorage = artifacts.require('./IntSetStorage.sol');
  contracts.utilUintSetStorage = artifacts.require('./UintSetStorage.sol');
}

// ABIs
abis.rocketGroupContract = artifacts.require('./group/RocketGroupContract.sol');
abis.rocketGroupAccessorContract = artifacts.require('./group/RocketGroupAccessorContract.sol');
abis.rocketNodeContract = artifacts.require('./node/RocketNodeContract.sol');
abis.rocketMinipool = artifacts.require('./minipool/RocketMinipool.sol');

// Minipool staking durations
const stakingDurations = {
  '3m': 20250,
  '6m': 40500,
  '12m': 81000,
};

// Pubsub event subscriptions
const subscriptions = {
  'minipool.status.change': ['rocketPool'],
  'minipool.user.deposit': ['rocketPool'],
  'minipool.available.change': ['rocketNode', 'rocketMinipoolSet'],
  'node.active.change': ['rocketNode'],
};

// Node tasks to register
const nodeTasks = {
  'DisableInactiveNodes': contracts.taskDisableInactiveNodes,
  'CalculateNodeFee': contracts.taskCalculateNodeFee,
};


/*** Utility Methods *****************/
// Compress / decompress ABIs
function compressABI(abi) {
  return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}
function decompressABI(abi) {
  return JSON.parse(pako.inflate(Buffer.from(abi, 'base64'), {to: 'string'}));
}
// Load ABI files and parse
function loadABI(abiFilePath) {
  return JSON.parse(config.fs.readFileSync(abiFilePath));
}


// Start exporting now
module.exports = async (deployer, network) => {

  // Truffle add '-fork' for some reason when deploying to actual testnets
  network = network.replace("-fork", "");

  // Set our web3 provider
  let $web3 = new config.web3('http://' + config.networks[network].host + ':' + config.networks[network].port);
  console.log(`Web3 1.0 provider using network: `+network);
  console.log('\n');

  // Accounts
  let accounts = await $web3.eth.getAccounts(function(error, result) {
    if(error != null) {
      console.log(error);
      console.log("Error retrieving accounts.'");
    }
    return result;
  });

  
  
  // Live deployment
  if ( network == 'live' ) {
    // Casper live contract address
    let casperDepositAddress = '0XADDLIVECASPERADDRESS';
    // Add our live RPL token address in place
    contracts.rocketPoolToken.address = '0xb4efd85c19999d84251304bda99e90b92300bd93';
  }

  // Goerli test network
  else if (network == 'goerli') {

    // Casper deposit contract details
    const casperDepositAddress = '0x4689a3C63CE249355C8a573B5974db21D2d1b8Ef';
    const casperDepositABI = loadABI('./contracts/contract/casper/compiled/Deposit.abi');
    contracts.casperDeposit = {
          address: casperDepositAddress,
              abi: casperDepositABI,
      precompiled: true
    };

  }

  // Test network deployment
  else {

    // Precompiled - Casper Deposit Contract
    const casperDepositABI = loadABI('./contracts/contract/casper/compiled/Deposit.abi');
    const casperDeposit = new $web3.eth.Contract(casperDepositABI, null, {
        from: accounts[0], 
        gasPrice: '20000000000' // 20 gwei
    });

    // Create the contract now
    const casperDepositContract = await casperDeposit.deploy(
      // Casper deployment 
      {               
        data: config.fs.readFileSync('./contracts/contract/casper/compiled/Deposit.bin')
      }).send({
          from: accounts[0], 
          gas: 8000000, 
          gasPrice: '20000000000'
      });

    // Set the Casper deposit address
    let casperDepositAddress = casperDepositContract._address;

    // Store it in storage
    contracts.casperDeposit = {
          address: casperDepositAddress,
              abi: casperDepositABI,
      precompiled: true
    };

    // Casper withdrawal contract
    contracts.casperWithdraw = artifacts.require('./casper/DummyWithdraw.sol');

    // Test interface contracts
    if (testUtils) {
      contracts.testLists = artifacts.require('./test/TestLists.sol');
      contracts.testQueues = artifacts.require('./test/TestQueues.sol');
      contracts.testSets = artifacts.require('./test/TestSets.sol');
    }

  }
 
  
  // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
  await deployer.deploy(rocketStorage);
  // Update the storage with the new addresses
  let rocketStorageInstance = await rocketStorage.deployed();
  // Deploy other contracts - have to be inside an async loop
  const deployContracts = async function() {
    for (let contract in contracts) {
      // Only deploy if it hasn't been deployed already like a precompiled
      if(!contracts[contract].hasOwnProperty('precompiled')) {
        await deployer.deploy(contracts[contract], rocketStorage.address);
      }
    }
  };
  
  // Run it
  await deployContracts();
  // Register all other contracts with storage and store their abi
  const addContracts = async function() {
    // Log RocketStorage
    console.log('\x1b[31m%s\x1b[0m:', '   Set Storage Address');
    console.log('     '+rocketStorage.address);
    for (let contract in contracts) {
      if(contracts.hasOwnProperty(contract)) {
        // Log it
        console.log('\x1b[31m%s\x1b[0m:', '   Set Storage '+contract+' Address');
        console.log('     '+contracts[contract].address);
        // First register the contract address as being part of the network so we can do a validation check using just the address
        await rocketStorageInstance.setAddress(
          $web3.utils.soliditySha3('contract.address', contracts[contract].address),
          contracts[contract].address
        );
        // Now register again that contracts name so we can retrieve it by name if needed
        await rocketStorageInstance.setAddress(
          $web3.utils.soliditySha3('contract.name', contract),
          contracts[contract].address
        );
        // Compress and store the ABI
        await rocketStorageInstance.setString(
          $web3.utils.soliditySha3('contract.abi', contract),
          compressABI(contracts[contract].abi)
        );
      } 
    }
  };
  
  // Register ABI-only contracts
  const addABIs = async function() {
    for (let contract in abis) {
      if(abis.hasOwnProperty(contract)) {
        console.log('\x1b[31m%s\x1b[0m:', '   Set Storage ABI');
        console.log('     '+contract);
        // Compress and store the ABI
        await rocketStorageInstance.setString(
          $web3.utils.soliditySha3('contract.abi', contract),
          compressABI(abis[contract].abi)
        );
      }
    }
  };
  
  // Register staking durations
  const registerStakingDurations = async function() {
    let minipoolSettingsInstance = await contracts.rocketMinipoolSettings.deployed();
    for (let duration in stakingDurations) {
      // Log it
      console.log('\x1b[31m%s\x1b[0m:', '   Register staking duration');
      console.log('     '+duration+': '+stakingDurations[duration]);
      await minipoolSettingsInstance.addMinipoolStakingDuration(duration, stakingDurations[duration]);
    }
  }
  
  // Register uniswap contracts
  const addUniswap = async function() {
    if (network != 'live') {

      // Load contract data
      const FactoryABI = loadABI('./contracts/contract/uniswap/compiled/factory.abi');
      const FactoryBytecode = config.fs.readFileSync('./contracts/contract/uniswap/compiled/factory.bin');
      const ExchangeABI = loadABI('./contracts/contract/uniswap/compiled/exchange.abi');
      const ExchangeBytecode = config.fs.readFileSync('./contracts/contract/uniswap/compiled/exchange.bin');

      // Get RP token contract addresses
      let rplAddress = contracts.rocketPoolToken.address;
      let rethAddress = contracts.rocketETHToken.address;

      // Initialise contracts
      let ExchangeContract = new $web3.eth.Contract(ExchangeABI);
      let FactoryContract = new $web3.eth.Contract(FactoryABI);

      // Deploy contracts
      let exchange = await ExchangeContract.deploy({data: ExchangeBytecode}).send({from: accounts[0], gas: 8000000});
      let factory = await FactoryContract.deploy({data: FactoryBytecode}).send({from: accounts[0], gas: 8000000});

      // Initialise factory
      await factory.methods.initializeFactory(exchange.options.address).send({from: accounts[0], gas: 8000000});

      // Create token exchanges
      await factory.methods.createExchange(rplAddress).send({from: accounts[0], gas: 8000000});
      await factory.methods.createExchange(rethAddress).send({from: accounts[0], gas: 8000000});

      // Get exchange addresses
      let rplExchangeAddress = await factory.methods.getExchange(rplAddress).call();
      let rethExchangeAddress = await factory.methods.getExchange(rethAddress).call();

      // Log
      console.log('\x1b[31m%s\x1b[0m:', '   Uniswap factory address');
      console.log('     ' + factory.options.address);
      console.log('\x1b[31m%s\x1b[0m:', '   Uniswap RPL exchange address');
      console.log('     ' + rplExchangeAddress);
      console.log('\x1b[31m%s\x1b[0m:', '   Uniswap rETH exchange address');
      console.log('     ' + rethExchangeAddress);

    }
  };
  
  // Register event subscriptions
  const registerSubscriptions = async function() {
    let publisherInstance = await contracts.utilPublisher.deployed();
    for (let event in subscriptions) {
      // Log it
      console.log('\x1b[31m%s\x1b[0m:', '   Add subscription event '+event);
      for (let si = 0; si < subscriptions[event].length; ++si) {
        console.log('     '+subscriptions[event][si]);
        // Regsiter the subscription
        await publisherInstance.addSubscriber($web3.utils.soliditySha3(event), subscriptions[event][si]);
      }
    }
  }
  
  // Register node tasks
  const registerNodeTasks = async function() {
    let nodeTasksInstance = await contracts.rocketNodeTasks.deployed();
    for (let task in nodeTasks) {
      // Log it
      console.log('\x1b[31m%s\x1b[0m:', '   Register node task');
      console.log('     '+task);
      let taskInstance = await nodeTasks[task].deployed();
      await nodeTasksInstance.add(taskInstance.address);
    }
  }
  // Deploy default Rocket Pool group & accessor contract
  const registerRocketPoolGroup = async function() {
    // Get contracts
    let rocketGroupSettingsInstance = await contracts.rocketGroupSettings.deployed();
    let rocketGroupAPIInstance = await contracts.rocketGroupAPI.deployed();
    // Get new group fee
    let newGroupFee = await rocketGroupSettingsInstance.getNewFee.call();
    // Create group
    let groupAddResult = await rocketGroupAPIInstance.add('rocketpool', 0, {value: newGroupFee});
    let groupId = groupAddResult.logs.filter(log => log.event == 'GroupAdd')[0].args.ID;
    // Create group accessor
    let groupAccessorResult = await rocketGroupAPIInstance.createDefaultAccessor(groupId);
    let groupAccessorAddress = groupAccessorResult.logs.filter(log => log.event == 'GroupCreateDefaultAccessor')[0].args.accessorAddress;
    // Add group accessor
    let rocketGroupInstance = await abis.rocketGroupContract.at(groupId);
    await rocketGroupInstance.addDepositor(groupAccessorAddress);
    await rocketGroupInstance.addWithdrawer(groupAccessorAddress);
    // Log it
    console.log('\x1b[31m%s\x1b[0m:', '   Rocket Pool group address');
    console.log('     '+groupId);
    console.log('\x1b[31m%s\x1b[0m:', '   Rocket Pool group accessor address');
    console.log('     '+groupAccessorAddress);
  }
  // Run it
  console.log('  Deploy Contracts');
  console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
  await addContracts();
  console.log('\n');
  console.log('\x1b[34m%s\x1b[0m', '  Set ABI Only Storage');
  console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
  await addABIs();
  console.log('\n');
  console.log('\x1b[34m%s\x1b[0m', '  Register Staking Durations');
  console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
  await registerStakingDurations();
  console.log('\n');
  console.log('\x1b[34m%s\x1b[0m', '  Deploy Uniswap contracts');
  console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
  await addUniswap();
  console.log('\n');
  console.log('\x1b[34m%s\x1b[0m', '  Register Event Subscribers');
  console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
  await registerSubscriptions();
  console.log('\n');
  console.log('\x1b[34m%s\x1b[0m', '  Register Node Tasks');
  console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
  await registerNodeTasks();
  console.log('\n');
  console.log('\x1b[34m%s\x1b[0m', '  Register RP Group');
  console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
  await registerRocketPoolGroup();
  // Disable direct access to storage now
  await rocketStorageInstance.setBool(
    $web3.utils.soliditySha3('contract.storage.initialised'),
    true
  );
  // Log it
  console.log('\n');
  console.log('\x1b[32m%s\x1b[0m', '  Storage Direct Access For Owner Removed... Lets begin! :)');
  console.log('\n');  

};


