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
  return JSON.parse(pako.inflate(Buffer.from(abi, 'base64'), { to: 'string' }));
}

// Load ABI files and parse
function loadABI(abiFilePath) {
  return JSON.parse(config.fs.readFileSync(abiFilePath));
}

/*** Contracts ***********************/

// Storage
const rocketStorage = artifacts.require('RocketStorage');

// Network contracts
const contracts = {
  // Vault
  rocketVault: artifacts.require('RocketVault'),
  // Auction
  rocketAuctionManager: artifacts.require('RocketAuctionManager'),
  // Deposit
  rocketDepositPool: artifacts.require('RocketDepositPool'),
  // Minipool
  rocketMinipoolDelegate: artifacts.require('RocketMinipoolDelegate'),
  rocketMinipoolManager: artifacts.require('RocketMinipoolManager'),
  rocketMinipoolQueue: artifacts.require('RocketMinipoolQueue'),
  rocketMinipoolStatus: artifacts.require('RocketMinipoolStatus'),
  rocketMinipoolPenalty: artifacts.require('RocketMinipoolPenalty'),
  // Network
  rocketNetworkBalances: artifacts.require('RocketNetworkBalances'),
  rocketNetworkFees: artifacts.require('RocketNetworkFees'),
  rocketNetworkPrices: artifacts.require('RocketNetworkPrices'),
  // Rewards
  rocketRewardsPool: artifacts.require('RocketRewardsPool'),
  rocketClaimDAO: artifacts.require('RocketClaimDAO'),
  rocketClaimNode: artifacts.require('RocketClaimNode'),
  rocketClaimTrustedNode: artifacts.require('RocketClaimTrustedNode'),
  // Node
  rocketNodeDeposit: artifacts.require('RocketNodeDeposit.sol'),
  rocketNodeManager: artifacts.require('RocketNodeManager.sol'),
  rocketNodeStaking: artifacts.require('RocketNodeStaking.sol'),
  // DAOs
  rocketDAOProposal: artifacts.require('RocketDAOProposal.sol'),
  rocketDAONodeTrusted: artifacts.require('RocketDAONodeTrusted.sol'),
  rocketDAONodeTrustedProposals: artifacts.require('RocketDAONodeTrustedProposals.sol'),
  rocketDAONodeTrustedActions: artifacts.require('RocketDAONodeTrustedActions.sol'),
  rocketDAONodeTrustedUpgrade: artifacts.require('RocketDAONodeTrustedUpgrade.sol'),
  rocketDAONodeTrustedSettingsMembers: artifacts.require('RocketDAONodeTrustedSettingsMembers.sol'),
  rocketDAONodeTrustedSettingsProposals: artifacts.require('RocketDAONodeTrustedSettingsProposals.sol'),
  rocketDAONodeTrustedSettingsMinipool: artifacts.require('RocketDAONodeTrustedSettingsMinipool.sol'),
  rocketDAOProtocol: artifacts.require('RocketDAOProtocol.sol'),
  rocketDAOProtocolProposals: artifacts.require('RocketDAOProtocolProposals.sol'),
  rocketDAOProtocolActions: artifacts.require('RocketDAOProtocolActions.sol'),
  rocketDAOProtocolSettingsInflation: artifacts.require('RocketDAOProtocolSettingsInflation.sol'),
  rocketDAOProtocolSettingsRewards: artifacts.require('RocketDAOProtocolSettingsRewards.sol'),
  rocketDAOProtocolSettingsAuction: artifacts.require('RocketDAOProtocolSettingsAuction.sol'),
  rocketDAOProtocolSettingsNode: artifacts.require('RocketDAOProtocolSettingsNode.sol'),
  rocketDAOProtocolSettingsNetwork: artifacts.require('RocketDAOProtocolSettingsNetwork.sol'),
  rocketDAOProtocolSettingsDeposit: artifacts.require('RocketDAOProtocolSettingsDeposit.sol'),
  rocketDAOProtocolSettingsMinipool: artifacts.require('RocketDAOProtocolSettingsMinipool.sol'),
  // Tokens

  gogoTokenGGPFixedSupply: artifacts.require('RocketTokenDummyGGP.sol'),
  gogoTokenGGPAVAX: artifacts.require('GoGoTokenGGPAVAX.sol'),
  gogoTokenGGP: artifacts.require('GoGoTokenGGP.sol'),
  // Utils
  addressQueueStorage: artifacts.require('AddressQueueStorage.sol'),
  addressSetStorage: artifacts.require('AddressSetStorage.sol'),
};

// Development helper contracts
const revertOnTransfer = artifacts.require('RevertOnTransfer.sol');

// Instance contract ABIs
const abis = {
  // Minipool
  rocketMinipool: [artifacts.require('RocketMinipoolDelegate.sol'), artifacts.require('RocketMinipool.sol')],
};

/*** Deployment **********************/

// Deploy Rocket Pool
module.exports = async (deployer, network) => {
  // Truffle add '-fork' for some reason when deploying to actual testnets
  network = network.replace('-fork', '');
  network.hasProvider = true;

  // Set our web3 provider
  console.log(`Web3 1.0 provider using network: ` + network);
  const provider = config.networks[network].provider();
  console.log(`provider: ` + provider);
  let $web3 = new config.web3(provider);
  console.log('\n');

  // Accounts
  let accounts = await $web3.eth.getAccounts(function(error, result) {
    if (error != null) {
      console.log(error);
      console.log("Error retrieving accounts.'");
    }
    return result;
  });

  console.log(accounts);

  // Live deployment
  if (network == 'live') {
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
    const casperDepositAddress = '0xff50ed3d0ec03ac01d4c79aad74928bff48a7b2b'; // Prater
    const casperDepositABI = loadABI('./contracts/contract/casper/compiled/Deposit.abi');
    contracts.casperDeposit = {
      address: casperDepositAddress,
      abi: casperDepositABI,
      precompiled: true,
    };
  }

  // Test network deployment
  else {
    console.log('deploying test network');
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
    console.log('finished deploying test network');
  }
  console.log('deploying rocketstorage');

  // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
  console.log('here');
  const rs = await deployer.deploy(rocketStorage);
  const rsTx = await web3.eth.getTransactionReceipt(rs.transactionHash);
  const deployBlock = rsTx.blockNumber;
  console.log('deployed rocketstorage');
  // Update the storage with the new addresses
  let rocketStorageInstance = await rocketStorage.deployed();
  console.log('got rs instance');
  // Deploy other contracts - have to be inside an async loop
  const deployContracts = async function() {
    for (let contract in contracts) {
      // Only deploy if it hasn't been deployed already like a precompiled
      if (!contracts[contract].hasOwnProperty('precompiled')) {
        switch (contract) {
          // New RPL contract - pass storage address & existing RPL contract address
          case 'gogoTokenGGP':
            await deployer.deploy(
              contracts[contract],
              rocketStorage.address,
              contracts.gogoTokenGGPFixedSupply.address
            );
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
    console.log('     ' + rocketStorage.address);
    // Add Rocket Storage to deployed contracts
    contracts.rocketStorage = artifacts.require('RocketStorage.sol');
    // Now process the rest
    for (let contract in contracts) {
      if (contracts.hasOwnProperty(contract)) {
        // Log it
        console.log('\x1b[31m%s\x1b[0m:', '   Set Storage ' + contract + ' Address');
        console.log('     ' + contracts[contract].address);
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
      if (abis.hasOwnProperty(contract)) {
        console.log('\x1b[31m%s\x1b[0m:', '   Set Storage ABI');
        console.log('     ' + contract);
        if (Array.isArray(abis[contract])) {
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
  await rocketStorageInstance.setUint($web3.utils.soliditySha3('deploy.block'), deployBlock);

  // Disable direct access to storage now
  await rocketStorageInstance.setDeployedStatus();
  if ((await rocketStorageInstance.getDeployedStatus()) != true) throw 'Storage Access Not Locked Down!!';

  // Log it
  console.log('\n');
  console.log('\x1b[32m%s\x1b[0m', '  Storage Direct Access For Owner Removed... Lets begin! :)');
  console.log('\n');

  // Deploy development help contracts
  if (network !== 'live' && network !== 'goerli') {
    await deployer.deploy(revertOnTransfer);
  }
};
