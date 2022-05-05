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
const rocketStorage =                       artifacts.require('RocketStorage.sol');

// Network contracts
const contracts = {
  // Vault
  rocketVault:                              artifacts.require('RocketVault.sol'),
  // Auction
  rocketAuctionManager:                     artifacts.require('RocketAuctionManager.sol'),
  // Deposit
  rocketDepositPool:                        artifacts.require('RocketDepositPool.sol'),
  // Minipool
  rocketMinipoolDelegate:                   artifacts.require('RocketMinipoolDelegate.sol'),
  rocketMinipoolManager:                    artifacts.require('RocketMinipoolManagerOld.sol'),
  rocketMinipoolQueue:                      artifacts.require('RocketMinipoolQueue.sol'),
  rocketMinipoolStatus:                     artifacts.require('RocketMinipoolStatus.sol'),
  rocketMinipoolPenalty:                    artifacts.require('RocketMinipoolPenalty.sol'),
  // Network
  rocketNetworkBalances:                    artifacts.require('RocketNetworkBalances.sol'),
  rocketNetworkFees:                        artifacts.require('RocketNetworkFees.sol'),
  rocketNetworkPrices:                      artifacts.require('RocketNetworkPrices.sol'),
  rocketNetworkPenalties:                   artifacts.require('RocketNetworkPenalties.sol'),
  // Rewards
  rocketRewardsPool:                        artifacts.require('RocketRewardsPoolOld.sol'),
  rocketClaimDAO:                           artifacts.require('RocketClaimDAO.sol'),
  rocketClaimNode:                          artifacts.require('RocketClaimNodeOld.sol'),
  rocketClaimTrustedNode:                   artifacts.require('RocketClaimTrustedNodeOld.sol'),
  // Node
  rocketNodeDeposit:                        artifacts.require('RocketNodeDepositOld.sol'),
  rocketNodeManager:                        artifacts.require('RocketNodeManagerOld.sol'),
  rocketNodeStaking:                        artifacts.require('RocketNodeStakingOld.sol'),
  // DAOs
  rocketDAOProposal:                        artifacts.require('RocketDAOProposal.sol'),
  rocketDAONodeTrusted:                     artifacts.require('RocketDAONodeTrusted.sol'),
  rocketDAONodeTrustedProposals:            artifacts.require('RocketDAONodeTrustedProposals.sol'),
  rocketDAONodeTrustedActions:              artifacts.require('RocketDAONodeTrustedActions.sol'),
  rocketDAONodeTrustedUpgrade:              artifacts.require('RocketDAONodeTrustedUpgrade.sol'),
  rocketDAONodeTrustedSettingsMembers:      artifacts.require('RocketDAONodeTrustedSettingsMembers.sol'),
  rocketDAONodeTrustedSettingsProposals:    artifacts.require('RocketDAONodeTrustedSettingsProposals.sol'),
  rocketDAONodeTrustedSettingsMinipool:     artifacts.require('RocketDAONodeTrustedSettingsMinipool.sol'),
  rocketDAOProtocol:                        artifacts.require('RocketDAOProtocol.sol'),
  rocketDAOProtocolProposals:               artifacts.require('RocketDAOProtocolProposals.sol'),
  rocketDAOProtocolActions:                 artifacts.require('RocketDAOProtocolActions.sol'),
  rocketDAOProtocolSettingsInflation:       artifacts.require('RocketDAOProtocolSettingsInflation.sol'),
  rocketDAOProtocolSettingsRewards:         artifacts.require('RocketDAOProtocolSettingsRewards.sol'),
  rocketDAOProtocolSettingsAuction:         artifacts.require('RocketDAOProtocolSettingsAuction.sol'),
  rocketDAOProtocolSettingsNode:            artifacts.require('RocketDAOProtocolSettingsNodeOld.sol'),
  rocketDAOProtocolSettingsNetwork:         artifacts.require('RocketDAOProtocolSettingsNetworkOld.sol'),
  rocketDAOProtocolSettingsDeposit:         artifacts.require('RocketDAOProtocolSettingsDeposit.sol'),
  rocketDAOProtocolSettingsMinipool:        artifacts.require('RocketDAOProtocolSettingsMinipool.sol'),
  // Tokens
  rocketTokenRPLFixedSupply:                artifacts.require('RocketTokenDummyRPL.sol'),
  rocketTokenRETH:                          artifacts.require('RocketTokenRETH.sol'),
  rocketTokenRPL:                           artifacts.require('RocketTokenRPL.sol'),
  // Upgrade
  rocketRewardsPoolNew:                     artifacts.require('RocketRewardsPool.sol'),
  rocketNodeManagerNew:                     artifacts.require('RocketNodeManager.sol'),
  rocketNodeStakingNew:                     artifacts.require('RocketNodeStaking.sol'),
  rocketMerkleDistributorMainnet:           artifacts.require('RocketMerkleDistributorMainnet.sol'),
  rocketDAONodeTrustedSettingsRewards:      artifacts.require('RocketDAONodeTrustedSettingsRewards.sol'),
  rocketSmoothingPool:                      artifacts.require('RocketSmoothingPool.sol'),
  rocketNodeDepositNew:                     artifacts.require('RocketNodeDeposit.sol'),
  rocketMinipoolManagerNew:                 artifacts.require('RocketMinipoolManager.sol'),
  rocketDAOProtocolSettingsNetworkNew:      artifacts.require('RocketDAOProtocolSettingsNetwork.sol'),
  rocketNodeDistributorFactory:             artifacts.require('RocketNodeDistributorFactory.sol'),
  rocketNodeDistributorDelegate:            artifacts.require('RocketNodeDistributorDelegate.sol'),
  rocketMinipoolFactory:                    artifacts.require('RocketMinipoolFactory.sol'),
  rocketDAOProtocolSettingsNodeNew:         artifacts.require('RocketDAOProtocolSettingsNode.sol'),
  rocketUpgradeOneDotOne:                   artifacts.require('RocketUpgradeOneDotOne.sol'),
  // Utils
  addressQueueStorage:                      artifacts.require('AddressQueueStorage.sol'),
  addressSetStorage:                        artifacts.require('AddressSetStorage.sol'),
};

// Development helper contracts
const revertOnTransfer = artifacts.require('RevertOnTransfer.sol');

// Instance contract ABIs
const abis = {
  // Minipool
  rocketMinipool:                           [artifacts.require('RocketMinipoolDelegate.sol'), artifacts.require('RocketMinipool.sol')],
};


/*** Deployment **********************/


// Deploy Rocket Pool
module.exports = async (deployer, network) => {

  // Truffle add '-fork' for some reason when deploying to actual testnets
  network = network.replace("-fork", "");

  // Set our web3 provider
  console.log(`Web3 1.0 provider using network: `+network);
  const provider = network.hasProvider ? config.networks[network].provider(): `http://${config.networks[network].host}:${config.networks[network].port}`;
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
      precompiled: true
    };
    // Add our live RPL token address in place
    contracts.rocketTokenRPLFixedSupply.address = '0xb4efd85c19999d84251304bda99e90b92300bd93';
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
        data: config.fs.readFileSync('./contracts/contract/casper/compiled/Deposit.bin').toString()
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
  }


  // Deploy rocketStorage first - has to be done in this order so that the following contracts already know the storage address
  const rs = await deployer.deploy(rocketStorage);
  const rsTx = await web3.eth.getTransactionReceipt(rs.transactionHash);
  const deployBlock = rsTx.blockNumber;
  // Update the storage with the new addresses
  let rocketStorageInstance = await rocketStorage.deployed();
  // Deploy other contracts - have to be inside an async loop
  const deployContracts = async function() {
    for (let contract in contracts) {
      // Only deploy if it hasn't been deployed already like a precompiled
      if(!contracts[contract].hasOwnProperty('precompiled')) {
        switch (contract) {

          // New RPL contract - pass storage address & existing RPL contract address
          case 'rocketTokenRPL':
            await deployer.deploy(contracts[contract], rocketStorage.address, contracts.rocketTokenRPLFixedSupply.address);
          break;

          // Contracts with no constructor args
          case 'rocketMinipoolDelegate':
          case 'rocketNodeDistributorDelegate':
            await deployer.deploy(contracts[contract]);
          break;

          // Upgrade rewards
          case 'rocketUpgradeOneDotOne':
            const upgrader = await deployer.deploy(contracts[contract], rocketStorage.address);
            const arguments = [
              [
                contracts.rocketMinipoolManagerNew.address,
                contracts.rocketNodeManagerNew.address,
                contracts.rocketNodeDepositNew.address,
                contracts.rocketDAOProtocolSettingsNetworkNew.address,
                contracts.rocketNodeDistributorFactory.address,
                contracts.rocketNodeDistributorDelegate.address,
                contracts.rocketRewardsPoolNew.address,
                contracts.rocketNodeStakingNew.address,
                contracts.rocketMerkleDistributorMainnet.address,
                contracts.rocketDAONodeTrustedSettingsRewards.address,
                contracts.rocketSmoothingPool.address,
                contracts.rocketMinipoolFactory.address,
                contracts.rocketDAOProtocolSettingsNodeNew.address,
              ],
              [
                compressABI(contracts.rocketMinipoolManagerNew.abi),
                compressABI(contracts.rocketNodeManagerNew.abi),
                compressABI(contracts.rocketNodeDepositNew.abi),
                compressABI(contracts.rocketDAOProtocolSettingsNetworkNew.abi),
                compressABI(contracts.rocketNodeDistributorFactory.abi),
                compressABI(contracts.rocketNodeDistributorDelegate.abi),
                compressABI(contracts.rocketRewardsPoolNew.abi),
                compressABI(contracts.rocketNodeStakingNew.abi),
                compressABI(contracts.rocketMerkleDistributorMainnet.abi),
                compressABI(contracts.rocketDAONodeTrustedSettingsRewards.abi),
                compressABI(contracts.rocketSmoothingPool.abi),
                compressABI(contracts.rocketMinipoolFactory.abi),
                compressABI(contracts.rocketDAOProtocolSettingsNodeNew.abi),
              ]
            ]
            await upgrader.set(...arguments)
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
    contracts.rocketStorage = artifacts.require('RocketStorage.sol');
    // Now process the rest
    for (let contract in contracts) {
      if(contracts.hasOwnProperty(contract)) {
        switch (contract) {
          // Ignore contracts that will be upgraded later
          case 'rocketRewardsPoolNew':
          case 'rocketNodeStakingNew':
          case 'rocketMerkleDistributorMainnet':
          case 'rocketDAONodeTrustedSettingsRewards':
          case 'rocketSmoothingPool':
          case 'rocketMinipoolManagerNew':
          case 'rocketNodeManagerNew':
          case 'rocketNodeDepositNew':
          case 'rocketDAOProtocolSettingsNetworkNew':
          case 'rocketNodeDistributorFactory':
          case 'rocketNodeDistributorDelegate':
          case 'rocketMinipoolFactory':
          case 'rocketDAOProtocolSettingsNodeNew':
            break;

          default:
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
            break;
        }
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

  // Perform distributor upgrade if we are not running in test environment
  if (network !== 'development') {
    const RocketUpgradeOneDotOne = artifacts.require('RocketUpgradeOneDotOne')
    const rocketUpgradeOneDotOne = await RocketUpgradeOneDotOne.deployed();
    await rocketUpgradeOneDotOne.execute({ from: accounts[0] });
  }
};