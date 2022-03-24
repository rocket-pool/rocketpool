/*** Dependencies ********************/


const pako = require('pako');


/*** Settings ************************/

const config = require('../truffle.js');

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


/*** Contracts ***********************/


// Storage
const rocketStorage =                       artifacts.require('RocketStorage');

// Network contracts
const contracts = {
  // Vault
  rocketVault:                              artifacts.require('RocketVault'),
  // Auction
  rocketAuctionManager:                     artifacts.require('RocketAuctionManager'),
  // Deposit
  rocketDepositPool:                        artifacts.require('RocketDepositPool'),
  // Minipool
  rocketMinipoolDelegate:                   artifacts.require('RocketMinipoolDelegate'),
  rocketMinipoolManager:                    artifacts.require('RocketMinipoolManager'),
  rocketMinipoolQueue:                      artifacts.require('RocketMinipoolQueue'),
  rocketMinipoolStatus:                     artifacts.require('RocketMinipoolStatus'),
  rocketMinipoolPenalty:                    artifacts.require('RocketMinipoolPenalty'),
  // Network
  rocketNetworkBalances:                    artifacts.require('RocketNetworkBalances'),
  rocketNetworkFees:                        artifacts.require('RocketNetworkFees'),
  rocketNetworkPrices:                      artifacts.require('RocketNetworkPrices'),
  // Rewards
  rocketRewardsPool:                        artifacts.require('RocketRewardsPool'),
  rocketClaimDAO:                           artifacts.require('RocketClaimDAO'),
  rocketClaimNode:                          artifacts.require('RocketClaimNode'),
  rocketClaimTrustedNode:                   artifacts.require('RocketClaimTrustedNode'),
  // Node
  rocketNodeDeposit:                        artifacts.require('RocketNodeDeposit'),
  rocketNodeManager:                        artifacts.require('RocketNodeManager'),
  rocketNodeStaking:                        artifacts.require('RocketNodeStaking'),
  // DAOs
  rocketDAOProposal:                        artifacts.require('RocketDAOProposal'),
  rocketDAONodeTrusted:                     artifacts.require('RocketDAONodeTrusted'),
  rocketDAONodeTrustedProposals:            artifacts.require('RocketDAONodeTrustedProposals'),
  rocketDAONodeTrustedActions:              artifacts.require('RocketDAONodeTrustedActions'),
  rocketDAONodeTrustedUpgrade:              artifacts.require('RocketDAONodeTrustedUpgrade'),
  rocketDAONodeTrustedSettingsMembers:      artifacts.require('RocketDAONodeTrustedSettingsMembers'),
  rocketDAONodeTrustedSettingsProposals:    artifacts.require('RocketDAONodeTrustedSettingsProposals'),
  rocketDAONodeTrustedSettingsMinipool:     artifacts.require('RocketDAONodeTrustedSettingsMinipool'),
  rocketDAOProtocol:                        artifacts.require('RocketDAOProtocol'),
  rocketDAOProtocolProposals:               artifacts.require('RocketDAOProtocolProposals'),
  rocketDAOProtocolActions:                 artifacts.require('RocketDAOProtocolActions'),
  rocketDAOProtocolSettingsInflation:       artifacts.require('RocketDAOProtocolSettingsInflation'),
  rocketDAOProtocolSettingsRewards:         artifacts.require('RocketDAOProtocolSettingsRewards'),
  rocketDAOProtocolSettingsAuction:         artifacts.require('RocketDAOProtocolSettingsAuction'),
  rocketDAOProtocolSettingsNode:            artifacts.require('RocketDAOProtocolSettingsNode'),
  rocketDAOProtocolSettingsNetwork:         artifacts.require('RocketDAOProtocolSettingsNetwork'),
  rocketDAOProtocolSettingsDeposit:         artifacts.require('RocketDAOProtocolSettingsDeposit'),
  rocketDAOProtocolSettingsMinipool:        artifacts.require('RocketDAOProtocolSettingsMinipool'),
  // Tokens
<<<<<<< HEAD
  rocketTokenRPLFixedSupply:                artifacts.require('RocketTokenDummyRPL'),
  rocketTokenRETH:                          artifacts.require('RocketTokenRETH'),
  rocketTokenRPL:                           artifacts.require('RocketTokenRPL'),
=======
  gogoTokenGGPFixedSupply: artifacts.require('RocketTokenDummyGGP.sol'),
  gogoTokenGGPAVAX: artifacts.require('GoGoTokenGGPAVAX.sol'),
  gogoTokenGGP: artifacts.require('GoGoTokenGGP.sol'),
>>>>>>> 51bdf207030d40456c87d33f783aa2d5cb300b92
  // Utils
  addressQueueStorage:                      artifacts.require('AddressQueueStorage'),
  addressSetStorage:                        artifacts.require('AddressSetStorage'),
};

// Development helper contracts
const revertOnTransfer = artifacts.require('RevertOnTransfer');

// Instance contract ABIs
const abis = {
  // Minipool
  rocketMinipool:                           [artifacts.require('RocketMinipoolDelegate'), artifacts.require('RocketMinipool')],
};


/*** Deployment **********************/


// Deploy Rocket Pool
module.exports = async (deployer, network) => {

  // Truffle add '-fork' for some reason when deploying to actual testnets
  network = network.replace("-fork", "");

<<<<<<< HEAD
  //hard setting this
  network.hasProvider = true;
=======
  // Set our web3 provider
  console.log(`Web3 1.0 provider using network: ` + network);
  // const provider = network.hasProvider ? config.networks[network].provider(): `http://${config.networks[network].host}:${config.networks[network].port}`;
  const privateKeys = [
    '0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027',
    '0x7b4198529994b0dc604278c99d153cfd069d594753d471171a1d102a10438e07',
    '0x15614556be13730e9e8d6eacc1603143e7b96987429df8726384c2ec4502ef6e',
    '0x31b571bf6894a248831ff937bb49f7754509fe93bbd2517c9c73c4144c0e97dc',
    '0x6934bef917e01692b789da754a0eae31a8536eb465e7bff752ea291dad88c675',
    '0xe700bdbdbc279b808b1ec45f8c2370e4616d3a02c336e68d85d4668e08f53cff',
    '0xbbc2865b76ba28016bc2255c7504d000e046ae01934b04c694592a6276988630',
    '0xcdbfd34f687ced8c6968854f8a99ae47712c4f4183b78dcc4a903d1bfe8cbf60',
    '0x86f78c5416151fe3546dece84fda4b4b1e36089f2dbc48496faf3a950f16157c',
    '0x750839e9dbbd2a0910efe40f50b2f3b2f2f59f5580bb4b83bd8c1201cf9a010a',
  ];
  const protocol = 'http';
  const ip = 'localhost';
  const port = 63975;
  const url = `${protocol}://${ip}:${port}/ext/bc/C/rpc`;
  const provider = new HDWalletProvider(privateKeys[0], url);
>>>>>>> 51bdf207030d40456c87d33f783aa2d5cb300b92

  // Set our web3 provider
  console.log(`Web3 1.0 provider using network: `+ network);
  const provider = config.networks[network].provider();
  console.log(`provider: ` + provider);
  let $web3 = new config.web3(provider);
  console.log('\n');

  // Accounts
  let accounts = await $web3.eth.getAccounts(function(error, result) {
    if(error != null) {
      console.log(error);
      console.log("Error retrieving accounts.'");
    }
    return result;
  });

  console.log(accounts);

  // Live deployment
  if ( network == 'live' ) {
    // Casper live contract address
    let casperDepositAddress = '0x00000000219ab540356cBB839Cbe05303d7705Fa';
    const casperDepositABI = loadABI('./contracts/contract/casper/compiled/Deposit.abi');
    contracts.casperDeposit = {
      address: casperDepositAddress,
      abi: casperDepositABI,
      precompiled: true,
    };
    // Add our live RPL token address in place
    contracts.gogoTokenGGPFixedSupply.address = '0xb4efd85c19999d84251304bda99e90b92300bd93';
  }

  // Goerli test network
  else if (network == 'goerli') {

    // Casper deposit contract details
    const casperDepositAddress = '0xff50ed3d0ec03ac01d4c79aad74928bff48a7b2b';       // Prater
    const casperDepositABI = loadABI('./contracts/contract/casper/compiled/Deposit.abi');
    contracts.casperDeposit = {
      address: casperDepositAddress,
      abi: casperDepositABI,
      precompiled: true
    };

  }

  // Test network deployment
  else {
    console.log("deploying test network")
    // Precompiled - Casper Deposit Contract
   /* const casperDepositABI = loadABI('./contracts/contract/casper/compiled/Deposit.abi');
    const casperDeposit = new $web3.eth.Contract(casperDepositABI, null, {
      from: accounts[0],
      gasPrice: '25000000000', // 20 gwei
    });
    console.log("1deploying test network")

    // Create the contract now
    const casperDepositContract = await casperDeposit
      .deploy(


    // Casper deployment
        {
          data: config.fs.readFileSync('./contracts/contract/casper/compiled/Deposit.bin').toString(),
        }
      )
      .send({
        from: accounts[0],
        gas: 8000000,
        gasPrice: '25000000000',
      });
    console.log("11deploying test network")

    // Set the Casper deposit address
    let casperDepositAddress = casperDepositContract._address;
    console.log("111deploying test network")

    // Store it in storage
    contracts.casperDeposit = {
      address: casperDepositAddress,
      abi: casperDepositABI,
      precompiled: true,
    };*/
    console.log("finished deploying test network")
  }
  console.log("deploying rocketstorage")

  // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
  console.log("here")
  const rs = await deployer.deploy(rocketStorage);
  const rsTx = await web3.eth.getTransactionReceipt(rs.transactionHash);
  const deployBlock = rsTx.blockNumber;
  console.log("deployed rocketstorage")
  // Update the storage with the new addresses
  let rocketStorageInstance = await rocketStorage.deployed();
  console.log("got rs instance")
  // Deploy other contracts - have to be inside an async loop
  const deployContracts = async function() {
    for (let contract in contracts) {
      // Only deploy if it hasn't been deployed already like a precompiled
      if(!contracts[contract].hasOwnProperty('precompiled')) {
        switch (contract) {
<<<<<<< HEAD

            // New RPL contract - pass storage address & existing RPL contract address
          case 'rocketTokenRPL':
            await deployer.deploy(contracts[contract], rocketStorage.address, contracts.rocketTokenRPLFixedSupply.address);
=======
          // New RPL contract - pass storage address & existing RPL contract address
          case 'gogoTokenGGP':
            await deployer.deploy(
              contracts[contract],
              rocketStorage.address,
              contracts.gogoTokenGGPFixedSupply.address
            );
>>>>>>> 51bdf207030d40456c87d33f783aa2d5cb300b92
            break;

            // Minipool delegate contract - no constructor args
          case 'rocketMinipoolDelegate':
            await deployer.deploy(contracts[contract]);
            break;

            // All other contracts - pass storage address
          default:
            await deployer.deploy(contracts[contract], rocketStorage.address);
            break;

        }
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
    // Add Rocket Storage to deployed contracts
    contracts.rocketStorage = artifacts.require('RocketStorage');
    // Now process the rest
    for (let contract in contracts) {
      if(contracts.hasOwnProperty(contract)) {
        // Log it
        console.log('\x1b[31m%s\x1b[0m:', '   Set Storage '+contract+' Address');
        console.log('     '+contracts[contract].address);
        // Register the contract address as part of the network
        await rocketStorageInstance.setBool(
            $web3.utils.soliditySha3('contract.exists', contracts[contract].address),
            true
        );
        // Register the contract's name by address
        await rocketStorageInstance.setString(
            $web3.utils.soliditySha3('contract.name', contracts[contract].address),
            contract
        );
        // Register the contract's address by name
        await rocketStorageInstance.setAddress(
            $web3.utils.soliditySha3('contract.address', contract),
            contracts[contract].address
        );
        // Compress and store the ABI by name
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
        if(Array.isArray(abis[contract])) {
          // Merge ABIs from multiple artifacts
          let combinedAbi = [];
          for (const artifact of abis[contract]) {
            combinedAbi = combinedAbi.concat(artifact.abi);
          }
          // Compress and store the ABI
          await rocketStorageInstance.setString(
              $web3.utils.soliditySha3('contract.abi', contract),
              compressABI(combinedAbi)
          );
        } else {
          // Compress and store the ABI
          await rocketStorageInstance.setString(
              $web3.utils.soliditySha3('contract.abi', contract),
              compressABI(abis[contract].abi)
          );
        }
      }
    }
  };

  // Run it
  console.log('\x1b[34m%s\x1b[0m', '  Deploy Contracts');
  console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
  await addContracts();
  console.log('\n');
  console.log('\x1b[34m%s\x1b[0m', '  Set ABI Only Storage');
  console.log('\x1b[34m%s\x1b[0m', '  ******************************************');
  await addABIs();

  // Store deployed block
  console.log('\n');
  console.log('Setting deploy.block to ' + deployBlock);
  await rocketStorageInstance.setUint(
      $web3.utils.soliditySha3('deploy.block'),
      deployBlock
  );

  // Disable direct access to storage now
  await rocketStorageInstance.setDeployedStatus();
  if(await rocketStorageInstance.getDeployedStatus() != true) throw 'Storage Access Not Locked Down!!';

  // Log it
  console.log('\n');
  console.log('\x1b[32m%s\x1b[0m', '  Storage Direct Access For Owner Removed... Lets begin! :)');
  console.log('\n');

  // Deploy development help contracts
  if (network !== 'live' && network !== 'goerli') {
    await deployer.deploy(revertOnTransfer);
  }
};
