// Dependencies
const pako = require('pako');

// Config
const config = require('../truffle.js');

// Contacts
const rocketStorage = artifacts.require('./RocketStorage.sol');
const rocketRole = artifacts.require('./RocketRole.sol');
const rocketPool = artifacts.require('./RocketPool.sol');
const rocketUser = artifacts.require('./RocketUser.sol');
const rocketNodeAdmin = artifacts.require('./RocketNodeAdmin.sol');
const rocketNodeValidator = artifacts.require('./contracts/RocketNodeValidator.sol');
const rocketNodeStatus = artifacts.require('./contracts/RocketNodeStatus.sol');
const rocketPoolMini = artifacts.require('./RocketPoolMini.sol');
const rocketPoolMiniDelegate = artifacts.require('./RocketPoolMiniDelegate.sol');
const rocketDepositToken = artifacts.require('./RocketDepositToken.sol');
const rocketPartnerAPI = artifacts.require('./RocketPartnerAPI.sol');
const rocketVault = artifacts.require('./RocketVault.sol');
const rocketVaultStore = artifacts.require('./RocketVaultStore.sol');
const rocketSettings = artifacts.require('./RocketSettings.sol');
const rocketFactory = artifacts.require('./RocketFactory.sol');
const rocketUpgrade = artifacts.require('./RocketUpgrade.sol');
const rocketUtils = artifacts.require('./RocketUtils.sol');
const rocketPoolTokenDummy = artifacts.require('./contract/DummyRocketPoolToken.sol');

// Interfaces
const rocketStorageInterface = artifacts.require('./contracts/interface/RocketStorageInterface.sol');
const rocketSettingsInterface = artifacts.require('./contracts/interface/RocketSettingsInterface.sol');

// Compress / decompress ABIs
function compressAbi(abi) {
  return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}
function decompressAbi(abi) {
  return JSON.parse(pako.inflate(Buffer.from(abi, 'base64'), {to: 'string'}));
}

// Accounts
const accounts = web3.eth.accounts;

// Casper settings
const casperInit = require('../contracts/contract/casper/compiled/simple_casper_init.js');
// Casper live contract address
let casperContractAddress = '0XADDLIVECASPERADDRESS';

// Load ABI files and parse
const loadABI = function(abiFilePath) {
  return JSON.parse(config.fs.readFileSync(abiFilePath));
}


module.exports = async (deployer, network) => {

  // Set our web3 1.0 provider
  let $web3;
  if ( network !== 'live' ) {
    const providerUrl = `http://${config.networks[network].host}:${config.networks[network].port}`;
    console.log(`Web3 1.0 provider using ${providerUrl}`);
    $web3 = new config.web3(providerUrl);
  }

  return deployer

    // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
    .deploy(rocketStorage)

    // Deploy other contracts
    .then(() => {
      return deployer.deploy([
        // Deploy Rocket Vault
        [rocketVault, rocketStorage.address],
        // Deploy Rocket Vault Store
        [rocketVaultStore, rocketStorage.address],
        // Deploy Rocket Utils
        [rocketUtils, rocketStorage.address],
        // Deploy Rocket Upgrade
        [rocketUpgrade, rocketStorage.address],
        // Deploy Rocket Role
        [rocketRole, rocketStorage.address],
        // Deploy Rocket User
        [rocketUser, rocketStorage.address],
        // Deploy rocket 3rd party partner API
        [rocketPartnerAPI, rocketStorage.address],
        // Deploy rocket deposit token
        [rocketDepositToken, rocketStorage.address],
        // Deploy rocket factory
        [rocketFactory, rocketStorage.address],
        // Deploy rocket settings
        [rocketSettings, rocketStorage.address],
        // Deploy the main rocket pool
        [rocketPool, rocketStorage.address],
        // Deploy the rocket node admin
        [rocketNodeAdmin, rocketStorage.address],
        // Deploy the rocket node validator
        [rocketNodeValidator, rocketStorage.address],
        // Deploy the rocket node status
        [rocketNodeStatus, rocketStorage.address],
        // Deploy the rocket pool mini delegate
        [rocketPoolMiniDelegate, rocketStorage.address],
        // Deploy dummy RPL Token contract for testing
        rocketPoolTokenDummy,
      ]);
    })

    // Post-deployment actions
    .then(async () => {      

      // Update the storage with the new addresses
      let rocketStorageInstance = await rocketStorage.deployed();
      console.log('\n');

      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage Address');
      console.log(rocketStorage.address);

      // Rocket Pool
      // First register the contract address as being part of the network so we can do a validation check using just the address
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketPool.address),
        rocketPool.address
      );
      // Now register again that contracts name so we can retrieve it by name if needed
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketPool'),
        rocketPool.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketPool'),
        compressAbi(rocketPool.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPool Address');
      console.log(rocketPool.address);

      // Rocket Role
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketRole.address),
        rocketRole.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketRole'),
        rocketRole.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketRole'),
        compressAbi(rocketRole.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketRole Address');
      console.log(rocketRole.address);

      // Rocket User
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketUser.address),
        rocketUser.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketUser'),
        rocketUser.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketUser'),
        compressAbi(rocketUser.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUser Address');
      console.log(rocketUser.address);

      // Rocket Node Admin
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketNodeAdmin.address),
        rocketNodeAdmin.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketNodeAdmin'),
        rocketNodeAdmin.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketNodeAdmin'),
        compressAbi(rocketNodeAdmin.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketNodeAdmin Address');
      console.log(rocketNodeAdmin.address);

      // Rocket Node Validator
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketNodeValidator.address),
        rocketNodeValidator.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketNodeValidator'),
        rocketNodeValidator.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketNodeValidator'),
        compressAbi(rocketNodeValidator.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketNodeValidator Address');
      console.log(rocketNodeValidator.address);

      // Rocket Node Status
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketNodeStatus.address),
        rocketNodeStatus.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketNodeStatus'),
        rocketNodeStatus.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketNodeStatus'),
        compressAbi(rocketNodeStatus.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketNodeStatus Address');
      console.log(rocketNodeStatus.address);

      // Rocket Pool Mini
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketPoolMini'),
        compressAbi(rocketPoolMini.abi)
      );

      // Rocket Pool Mini Delegate
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketPoolMiniDelegate.address),
        rocketPoolMiniDelegate.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketPoolMiniDelegate'),
        rocketPoolMiniDelegate.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketPoolMiniDelegate'),
        compressAbi(rocketPoolMiniDelegate.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPoolMiniDelegate Address');
      console.log(rocketPoolMiniDelegate.address);

      // Rocket Factory
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketFactory.address),
        rocketFactory.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketFactory'),
        rocketFactory.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketFactory'),
        compressAbi(rocketFactory.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketFactory Address');
      console.log(rocketFactory.address);

      // Rocket Upgrade
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketUpgrade.address),
        rocketUpgrade.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketUpgrade'),
        rocketUpgrade.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketUpgrade'),
        compressAbi(rocketUpgrade.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUpgrade Address');
      console.log(rocketUpgrade.address);

      // Rocket Utils
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketUtils.address),
        rocketUtils.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketUtils'),
        rocketUtils.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketUtils'),
        compressAbi(rocketUtils.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketUtils Address');
      console.log(rocketUtils.address);

      // Rocket Partner API
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketPartnerAPI.address),
        rocketPartnerAPI.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketPartnerAPI'),
        rocketPartnerAPI.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketPartnerAPI'),
        compressAbi(rocketPartnerAPI.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPartnerAPI Address');
      console.log(rocketPartnerAPI.address);

      // Rocket Deposit Token
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketDepositToken.address),
        rocketDepositToken.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketDepositToken'),
        rocketDepositToken.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketDepositToken'),
        compressAbi(rocketDepositToken.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketDepositToken Address');
      console.log(rocketDepositToken.address);

      // Rocket Pool Token
      await rocketStorageInstance.setAddress(
        // If we are migrating to live mainnet, set the token address for the current live RPL contract
        config.web3.utils.soliditySha3('contract.name', 'rocketPoolToken'),
        network == 'live' ? '0xb4efd85c19999d84251304bda99e90b92300bd93' : rocketPoolTokenDummy.address
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketPoolToken Address');
      console.log(rocketPoolTokenDummy.address);

      // Rocket Vault
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketVault.address),
        rocketVault.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketVault'),
        rocketVault.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketVault'),
        compressAbi(rocketVault.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketVault Address');
      console.log(rocketVault.address);

      // Rocket Vault Store
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketVaultStore.address),
        rocketVaultStore.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketVaultStore'),
        rocketVaultStore.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketVaultStore'),
        compressAbi(rocketVaultStore.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage rocketVaultStore Address');
      console.log(rocketVaultStore.address);

      // Rocket Settings
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', rocketSettings.address),
        rocketSettings.address
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'rocketSettings'),
        rocketSettings.address
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'rocketSettings'),
        compressAbi(rocketSettings.abi)
      );
      // Log it
      console.log('\x1b[33m%s\x1b[0m:', 'Set Storage RocketSettings Address');
      console.log(rocketSettings.address);
      console.log('\n');                                  

      /*** Initialise **********/
      const rocketSettingsInstance = await rocketSettings.deployed();
      await rocketSettingsInstance.init();

      console.log('\x1b[32m%s\x1b[0m', 'Post - Settings Initialised');
      console.log(rocketSettings.address);

      /*** Casper Precompiled Contracts **********/

      // These only need to be deployed when testing
      if ( network != 'live' ) {

          // Seed a user account which has signed the transaction used to create the RLP decoder
          // TX for the RLP DECODER CONTRACT HERE https://github.com/ethereum/vyper/blob/master/vyper/utils.py#L110
          console.log('\x1b[32m%s\x1b[0m', 'Casper - Seeding user account for RLP contract deploy');
          await $web3.eth.sendTransaction({
            from: accounts[0],
            to: '0xd2c560282c9C02465C2dAcdEF3E859E730848761',
            value: 6270960000000000,
            gas: 1000000,
          });
          console.log('\x1b[32m%s\x1b[0m', 'Casper - Deploying RLP contract');
          // Send the signed transaction now - creates contract @ 0xCb969cAAad21A78a24083164ffa81604317Ab603
          let rlpTX = await $web3.eth.sendSignedTransaction('0xf90237808506fc23ac00830330888080b902246102128061000e60003961022056600060007f010000000000000000000000000000000000000000000000000000000000000060003504600060c082121515585760f882121561004d5760bf820336141558576001905061006e565b600181013560f783036020035260005160f6830301361415585760f6820390505b5b368112156101c2577f010000000000000000000000000000000000000000000000000000000000000081350483602086026040015260018501945060808112156100d55760018461044001526001828561046001376001820191506021840193506101bc565b60b881121561014357608081038461044001526080810360018301856104600137608181141561012e5760807f010000000000000000000000000000000000000000000000000000000000000060018401350412151558575b607f81038201915060608103840193506101bb565b60c08112156101b857600182013560b782036020035260005160388112157f010000000000000000000000000000000000000000000000000000000000000060018501350402155857808561044001528060b6838501038661046001378060b6830301830192506020810185019450506101ba565bfe5b5b5b5061006f565b601f841315155857602060208502016020810391505b6000821215156101fc578082604001510182826104400301526020820391506101d8565b808401610420528381018161044003f350505050505b6000f31b2d4f');

          console.log('\x1b[32m%s\x1b[0m', 'Casper - Deploying Purity Checker');
          // Precompiled - Purity Checker
          const purityChecker = new $web3.eth.Contract(loadABI('./contracts/contract/casper/compiled/purity_checker.abi'), null, {
            from: accounts[0], 
            gasPrice: '20000000000' // 20 gwei
          });
          // Deploy Purity Checker
          const purityCheckerContract = await purityChecker.deploy({data: '0x'+config.fs.readFileSync('./contracts/contract/casper/compiled/purity_checker.bin')}).send({
                  from: accounts[0], 
                  gas: 1500000, 
                  gasPrice: '20000000000'
          });

          console.log('\x1b[32m%s\x1b[0m', 'Casper - Deploying Sig Hasher');
          // Precompiled - Signature Hasher
          const sigHasher = new $web3.eth.Contract(loadABI('./contracts/contract/casper/compiled/sighash.abi'), null, {
              from: accounts[0], 
              gasPrice: '20000000000' // 20 gwei
          });
          // Deploy Signature Hasher
          const sigHashContract = await sigHasher.deploy({data: '0x'+config.fs.readFileSync('./contracts/contract/casper/compiled/sighash.bin')}).send({
                from: accounts[0], 
                gas: 1500000, 
                gasPrice: '20000000000'
          });

          console.log('\x1b[32m%s\x1b[0m', 'Casper - Deploying');

          // Note Casper is deployed as late as possible to make sure its initial current_epoch correctly (if many transactions occur after its deployment, block number will be too far for the correct epoch to be used)
          // Precompiled - Casper
          const casper = new $web3.eth.Contract(loadABI('./contracts/contract/casper/compiled/simple_casper.abi'), null, {
              from: accounts[0], 
              gasPrice: '20000000000' // 20 gwei
          });
          // Deploy Casper
          let casperBytecode = config.fs.readFileSync('./contracts/contract/casper/compiled/simple_casper.bin');
          // Update the casper bytecode to not use the rlp_decoder address specified here https://github.com/ethereum/vyper/blob/170229494a582735dc2973eb2b6f4ef6f493f67c/vyper/utils.py#L106
          // We need it to use the one we deployed, otherwise we'd need to recompile Vyper to use this one, so do a find and replace in the bytecode
          casperBytecode = casperBytecode.toString().replace(/5185D17c44699cecC3133114F8df70753b856709/gi, 'Cb969cAAad21A78a24083164ffa81604317Ab603').trim();
          // Create the contract now
          const casperContract = await casper.deploy(
            // Casper deployment 
            {               
              data: casperBytecode
            }).send({
                from: accounts[0], 
                value: new $web3.utils.BN('5000000000000000000000'), // 5000 ETH starting balance for Casper
                gas: 8000000, 
                gasPrice: '20000000000'
            });
          // Set the Casper contract address
          casperContractAddress = casperContract._address;

          console.log('\x1b[32m%s\x1b[0m', 'Casper - Initialising');
          await casperContract.methods.init(...casperInit.init(sigHashContract._address, purityCheckerContract._address, web3.toWei('5', 'ether')))
            .send({
              from: accounts[0], 
              gas: 3000000, 
              gasPrice: '20000000000'
            });
          // Log it
          console.log('\x1b[32m%s\x1b[0m:', 'Casper - Deployed and Initialised');
          console.log(casperContractAddress); 
      }

      // Set Caspers address in Rocket Storage
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.address', casperContractAddress),
        casperContractAddress
      );
      await rocketStorageInstance.setAddress(
        config.web3.utils.soliditySha3('contract.name', 'casper'),
        casperContractAddress
      );
      await rocketStorageInstance.setString(
        config.web3.utils.soliditySha3('contract.abi', 'casper'),
        compressAbi(loadABI('./contracts/contract/casper/compiled/simple_casper.abi'))
      );

      // Log it
      console.log('\x1b[32m%s\x1b[0m:', 'Casper - Address Updated');
      console.log(casperContractAddress); 

      /*** Permissions *********/
      
      // Disable direct access to storage now
      await rocketStorageInstance.setBool(
        config.web3.utils.soliditySha3('contract.storage.initialised'),
        true
      );
      // Log it
      console.log('\x1b[32m%s\x1b[0m', 'Post - Storage Direct Access Removed');

    });

};

