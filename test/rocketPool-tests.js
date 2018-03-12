// OS methods
const os = require('os');
import { printTitle, assertThrows, printEvent, soliditySha3 } from './utils';
import { RocketUser, RocketNode, RocketPool, RocketPoolMini, RocketDepositToken, RocketPartnerAPI, RocketVault, RocketSettings, RocketStorage, Casper, CasperValidation} from './artifacts';

// Import modular tests
import rocketVaultAdminTests from './rocket-vault/rocket-vault-admin-tests';
// The newer version of Web3 is used for hashing, the old one that comes with truffle does it incorrectly. Waiting for them to upgrade truffles web3.
const web3New = require('web3');

const displayEvents = false;

// Display events triggered during the tests
if (displayEvents) {
  RocketPool.deployed().then(rocketPool => {
    const eventWatch = rocketPool
      .allEvents({
        fromBlock: 0,
        toBlock: 'latest',
      })
      .watch((error, result) => {
        // This will catch all events, regardless of how they originated.
        if (error == null) {
          // Print the event
          printEvent('rocket', result, '\x1b[33m%s\x1b[0m:');
          // Listen for new pool events too
          if (result.event == 'PoolCreated') {
            // Get an instance of that pool
            const miniPool = RocketPoolMini.at(result.args._address);
            // Watch for events in minipools also as with the main contract
            const poolEventWatch = miniPool
              .allEvents({
                fromBlock: 0,
                toBlock: 'latest',
              })
              .watch((error, result) => {
                // This will catch all pool events, regardless of how they originated.
                if (error == null) {
                  printEvent('minipool', result, '\x1b[32m%s\x1b[0m');
                }
              });
          }
        }
      });
  });
}

// Start the tests
contract('RocketPool', accounts => {
  // Excessive? Yeah probably :)
  console.log('\n');
  console.log('______           _        _    ______           _ ');
  console.log('| ___ \\         | |      | |   | ___ \\         | |');
  console.log('| |_/ /___   ___| | _____| |_  | |_/ /__   ___ | |');
  console.log('|    // _ \\ / __| |/ / _ \\ __| |  __/ _ \\ / _ \\| |');
  console.log('| |\\ \\ (_) | (__|   <  __/ |_  | | | (_) | (_) | |');
  console.log('\\_| \\_\\___/ \\___|_|\\_\\___|\\__| \\_|  \\___/ \\___/|_|');

  // The owner
  const owner = web3.eth.coinbase;

  // Rocket Pool settings
  // Deposit gas has to cover potential minipool contract creation, will often be much cheaper
  const rocketDepositGas = 4800000;
  const rocketWithdrawalGas = 1450000;

  // Node accounts and gas settings
  const nodeFirst = accounts[8];
  const nodeFirstProviderID = 'aws';
  const nodeFirstSubnetID = 'nvirginia';
  const nodeFirstInstanceID = 'i-1234567890abcdef5';
  const nodeFirstRegionID = 'usa-east';
  let nodeFirstValCodeAddress = 0;
  const nodeSecond = accounts[9];
  const nodeSecondProviderID = 'rackspace';
  const nodeSecondSubnetID = 'ohio';
  const nodeSecondInstanceID = '4325';
  const nodeSecondRegionID = 'usa-east';
  let nodeSecondValCodeAddress = 0;
  const nodeRegisterGas = 1600000;
  const nodeCheckinGas = 950000;

  // UPDATE: The first version of Casper wont use the validation code, just the address of the validator, will keep this in for now in case it changes in the future
  // Bytes - Set the node validation code (EVM bytecode, serving as a sort of public key that will be used to verify blocks and other consensus messages signed by it - just an example below)
  // (converted to Bytes32 until Solidity allows passing of variable length types (bytes, string) between contracts - https://github.com/ethereum/EIPs/pull/211 )
  // const nodeFirstValidationCode = web3.sha3('PUSH1 0 CALLDATALOAD SLOAD NOT PUSH1 9 JUMPI STOP JUMPDEST PUSH1 32 CALLDATALOAD PUSH1 0 CALLDATALOAD SSTORE');
  // Bytes32 - Node value provided for the casper deposit function should be the result of computing a long chain of hashes (TODO: this will need work in the future when its defined better)
  // const nodeFirstRandao = '0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658';

  // User accounts
  const userFirst = accounts[1];
  const userSecond = accounts[2];
  const userSecondBackupAddress = accounts[4];
  const userThird = accounts[3];

  // Mocks partner accounts
  const partnerFirst = accounts[5];
  const partnerFirstName = 'Coinbase';
  const partnerFirstUserAccount = accounts[6];
  const partnerSecond = accounts[7];
  const partnerSecondName = 'MEW';
  const partnerRegisterGas = 200000;

  // TODO: the state of these minipools is shared (no test isolation)
  // should be fixed so each test has an isolated pool
  // Minipools
  let miniPoolFirst;
  let miniPoolSecond;

  // Contracts
  let rocketStorage;
  let rocketSettings;
  let rocketUser;
  let rocketNode;
  let rocketDeposit;
  let rocketPool;
  let rocketPartnerAPI;
  let rocketVault;
  let casper;

  beforeEach(async () => {
    rocketStorage = await RocketStorage.deployed();
    rocketSettings = await RocketSettings.deployed();
    rocketUser = await RocketUser.deployed();
    rocketNode = await RocketNode.deployed();
    rocketDeposit = await RocketDepositToken.deployed();
    rocketPool = await RocketPool.deployed();
    rocketPartnerAPI = await RocketPartnerAPI.deployed();
    rocketVault = await RocketVault.deployed();
    casper = await Casper.deployed();
  });

  // Owners direct access to storage is removed after initialisation when deployed
  it(printTitle('owner', 'fail to access storage directly after deployment'), async () => {
    const result = rocketStorage.setBool(web3.sha3('test.access'), true, { from: owner, gas: 250000 });
    await assertThrows(result);
  });

  // Simulate Caspers epoch and dynasty changing
  it(
    printTitle(
      'casper',
      'simulate Caspers epoch and dynasty changing'
    ),
    async () => {

      // Increment epoch
      await casper.set_increment_epoch({
        from: owner
      });

      await casper.set_increment_epoch({
        from: owner
      });
      
      // Increment dynasty 
      await casper.set_increment_dynasty({
        from: owner
      });

      // Check that the first minipool contract has been attached to the node
      const casperDynasty = await casper.get_dynasty.call().valueOf();
      const casperEpoch = await casper.get_current_epoch.call().valueOf();

      assert.equal(casperEpoch, 2, 'Casper epoch does not match');
      assert.equal(casperDynasty, 1, 'Casper dynasty does not match');
    }
  );

  // Register validation contract address for node
  it(printTitle('nodeFirst', 'create validation contract and set address'), async () => {
    // Creates a blank contract for use in making validation address contracts
    // 500k gas limit @ 10 gwei TODO: Make these configurable on the smart node package by reading from RocketSettings contract so we can adjust when needed
    const nodeFirstValCodeContract = await CasperValidation.new({gas: 500000, gasPrice: 10000000000, from: nodeFirst});    
    nodeFirstValCodeAddress = nodeFirstValCodeContract.address;
    assert.notEqual(nodeFirstValCodeAddress, 0, 'Validation contract creation failed');
  });

   // Register test node
  it(printTitle('owner', 'register first node and verify it\'s signature and validation contract are correct'), async () => {
    // Sign the message for the nodeAdd function to prove ownership of the address being registered
    let signature =  web3.eth.sign(nodeFirst, soliditySha3(nodeFirstValCodeAddress));
    await rocketNode.nodeAdd(nodeFirst, nodeFirstProviderID, nodeFirstSubnetID, nodeFirstInstanceID, nodeFirstRegionID, nodeFirstValCodeAddress, signature, { from: owner, gas: nodeRegisterGas });
    const result = await rocketNode.getNodeCount.call().valueOf();
    assert.equal(result, 1, 'Invalid number of nodes registered');
  });

  // Try to register a node with a wrong validation address
  it(printTitle('owner', 'fail to register a node with a validation contract that does not match'), async () => {
     // Sign the message for the nodeAdd function to prove ownership of the address being registered
     let signature = web3.eth.sign(nodeSecond, soliditySha3(nodeSecondValCodeAddress));
     const result = rocketNode.nodeAdd(nodeSecond, nodeSecondProviderID, nodeSecondSubnetID, nodeSecondInstanceID, nodeSecondRegionID, nodeFirstValCodeAddress, signature, { from: owner, gas: nodeRegisterGas });
     await assertThrows(result);
  });

  // Register validation contract address for node
  it(printTitle('nodeSecond', 'create validation contract and set address'), async () => {
    // Creates a blank contract for use in making validation address contracts
    // 500k gas limit @ 10 gwei TODO: Make these configurable on the smart node package by reading from RocketSettings contract so we can adjust when needed
    const nodeSecondValCodeContract = await CasperValidation.new({gas: 500000, gasPrice: 10000000000, from: nodeSecond});    
    nodeSecondValCodeAddress = nodeSecondValCodeContract.address;
    assert.notEqual(nodeSecondValCodeAddress, 0, 'Validation contract creation failed');
  });

   // Register test node
  it(printTitle('owner', 'register second node and verify it\'s signature and validation contract are correct'), async () => {
    // Sign the message for the nodeAdd function to prove ownership of the address being registered
    let signature =  web3.eth.sign(nodeSecond, soliditySha3(nodeSecondValCodeAddress));
    await rocketNode.nodeAdd(nodeSecond, nodeSecondProviderID, nodeSecondSubnetID, nodeSecondInstanceID, nodeSecondRegionID, nodeSecondValCodeAddress, signature, { from: owner, gas: nodeRegisterGas });
    const result = await rocketNode.getNodeCount.call().valueOf();
    assert.equal(result, 2, 'Invalid number of nodes registered');
  });

  // Try to register a new partner as a non rocket pool owner
  it(printTitle('non owner', 'fail to register a partner'), async () => {
    const result = rocketPartnerAPI.partnerAdd(partnerFirst, partnerFirstName, {
      from: userFirst,
      gas: partnerRegisterGas,
    });
    await assertThrows(result);
  });

  // Register two 3rd party partners
  it(printTitle('owner', 'register 2 partners'), async () => {
    await rocketPartnerAPI.partnerAdd(partnerFirst, partnerFirstName, {
      from: web3.eth.coinbase,
      gas: partnerRegisterGas,
    });
    await rocketPartnerAPI.partnerAdd(partnerSecond, partnerSecondName, {
      from: web3.eth.coinbase,
      gas: partnerRegisterGas,
    });

    const result = await rocketPartnerAPI.getPartnerCount.call().valueOf();
    assert.equal(result, 2, 'Invalid number of partners registered');
  });

  // Attempt to make a deposit with an incorrect pool staking time ID
  it(printTitle('partnerFirst', 'fail to deposit with an incorrect pool staking time ID'), async () => {
    // Get the min ether required to launch a minipool
    const minEther = await rocketSettings.getMiniPoolLaunchAmount.call().valueOf();
    // Calculate just enough ether to create the pool
    const sendAmount = minEther - web3.toWei('1', 'ether');

    // Deposit on a behalf of the partner and also specify a incorrect pool staking time ID
    const result = rocketPartnerAPI.APIpartnerDeposit(partnerFirstUserAccount, 'beer', {
      from: partnerFirst,
      value: sendAmount,
      gas: rocketDepositGas,
    });
    await assertThrows(result);
  });

  // Attempt to make a deposit with an unregistered 3rd party partner
  it(printTitle('userFirst', 'fail to deposit with an unregistered partner'), async () => {
    // Get the min ether required to launch a minipool
    const minEther = await rocketSettings.getMiniPoolLaunchAmount.call().valueOf();
    // Calculate just enough ether to create the pool
    const sendAmount = minEther - web3.toWei('1', 'ether');

    // Deposit on behalf of the partner and also specify the pool staking time ID
    const result = rocketPartnerAPI.APIpartnerDeposit(userThird, 'short', {
      from: userSecond,
      value: sendAmount,
      gas: rocketDepositGas,
    });
    await assertThrows(result);
  });

  // Send Ether to Rocket pool with just less than the min amount required to launch a minipool with no specified 3rd party user partner
  it(printTitle('userFirst', 'sends ether to RP, create first minipool, registers user with pool'), async () => {
    // Get the min ether required to launch a minipool
    const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call().valueOf();

    // Send Ether as a user, but send just enough to create the pool, but not launch it
    const sendAmount = parseInt(minEtherRequired) - parseInt(web3.toWei('2', 'ether'));

    const result = await rocketUser.userDeposit('short', {
      from: userFirst,
      to: rocketUser.address,
      value: sendAmount,
      gas: rocketDepositGas,
    });

    const log = result.logs.find(({ event }) => event == 'Transferred');
    assert.notEqual(log, undefined); // Check that an event was logged

    const poolAddress = log.args._to;

    // Get an instance of that pool and do further checks
    miniPoolFirst = RocketPoolMini.at(poolAddress);

    const poolStatus = await miniPoolFirst.getStatus.call().valueOf();
    const poolBalance = web3.eth.getBalance(miniPoolFirst.address).valueOf();

    assert.equal(poolStatus, 0, 'Invalid minipool status');
    assert.equal(poolBalance, sendAmount, 'Invalid minipool balance');
  });


  // Have the same initial user send an deposit again, to trigger the pool to go into countdown
  it(
    printTitle(
      'userFirst',
      'sends ether to RP again, their balance updates, first minipool remains accepting deposits and only 1 reg user'
    ),
    async () => {
      // Get the min ether required to launch a minipool
      const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call().valueOf();

      // Send Ether as a user, send enough not to trigger the pool to enter countdown status for launch
      const sendAmount = web3.toWei('1', 'ether');

      const result = await rocketUser.userDeposit('short', {
        from: userFirst,
        to: rocketUser.address,
        value: sendAmount,
        gas: rocketDepositGas,
      });

      const log = result.logs.find(({ event }) => event == 'Transferred');
      assert.notEqual(log, undefined); // Check that an event was logged

      const userSendAmount = log.args.value;
      const userSendAddress = log.args._from;
      const poolAddress = log.args._to;

      // Get the instance the prev minipool
      const miniPool = RocketPoolMini.at(poolAddress);

      // Get the pool status
      const poolStatus = await miniPool.getStatus.call().valueOf();
      const poolBalance = web3.eth.getBalance(miniPool.address).valueOf();

      // Now just count the users to make sure this user wasn't added twice
      const userCount = await miniPool.getUserCount.call().valueOf();
      const userResult = await miniPool.getUser.call(userFirst);
      return;
      const user = userResult.valueOf();
      const userBalance = userResult[1].valueOf();

      assert.equal(userSendAmount, sendAmount, 'Invalid user send amount');
      assert.equal(poolStatus, 0, 'Invalid minipool status');
      assert.isTrue(poolBalance > sendAmount, 'Invalid minipool balance');
      assert.equal(userCount, 1, 'Invalid user count');
      assert.equal(userBalance, minEtherRequired - web3.toWei('1', 'ether'), 'Invalid user balance');
    }
  );


  // Have a new user send an deposit, to trigger the pool to go into countdown
  it(
    printTitle('userSecond', 'sends ether to RP, first minipool status changes to countdown and only 2 reg users'),
    async () => {
      // Get the min ether required to launch a minipool
      const minEtherRequired = await rocketSettings.getMiniPoolLaunchAmount.call().valueOf();
      // Send Ether as a user, send enough not to trigger the pool to enter countdown status for launch
      const sendAmount = web3.toWei('5', 'ether');

      const result = await rocketUser.userDeposit('short', {
        from: userSecond,
        to: rocketUser.address,
        value: sendAmount,
        gas: rocketDepositGas,
      });

      const log = result.logs.find(({ event }) => event == 'Transferred');
      assert.notEqual(log, undefined); // Check that an event was logged

      const userSendAmount = log.args.value;
      const userSendAddress = log.args._from;
      const poolAddress = log.args._to;

      // Get the instance the prev minipool
      const miniPool = RocketPoolMini.at(poolAddress);
      const poolStatus = await miniPool.getStatus.call().valueOf();
      const poolBalance = web3.eth.getBalance(miniPool.address).valueOf();

      // Now just count the users to make sure this user wasn't added twice
      const userCount = await miniPool.getUserCount.call().valueOf();

      assert.equal(userSendAmount, sendAmount, 'Invalid user send amount');
      assert.equal(poolStatus, 1, 'Invalid minipool status');
      assert.equal(userCount, 2, 'Invalid user count');
      assert.isTrue(poolBalance > sendAmount, 'Invalid minipool balance');
    }
  );

  // Second user sets a backup withdrawal address
  it(
    printTitle('userSecond', 'registers a backup withdrawal address on their deposit while minipool is in countdown'),
    async () => {
      // Set the backup address
      const result = await rocketUser.userSetWithdrawalDepositAddress(userSecondBackupAddress, miniPoolFirst.address, {
        from: userSecond,
        gas: 550000,
      });

      const log = result.logs.find(({ event }) => event == 'UserSetBackupWithdrawalAddress');
      assert.notEqual(log, undefined); // Check that an event was logged

      const newBackupAddress = log.args._userBackupAddress;
      assert.equal(newBackupAddress, userSecondBackupAddress, 'Backup address does not match');
    }
  );

  // Another user (partner user) sends a deposit and has a new pool accepting deposits created for them as the previous one is now in countdown to launch mode and not accepting deposits
  it(
    printTitle(
      'partnerFirst',
      'send ether to RP on behalf of their user, second minipool is created for them and is accepting deposits'
    ),
    async () => {
      // Get the min ether required to launch a minipool
      const minEther = await rocketSettings.getMiniPoolLaunchAmount.call().valueOf();
      // Send Ether as a user, but send just enough to create the pool, but not launch it
      const sendAmount = parseInt(minEther) - parseInt(web3.toWei('1', 'ether'));
      // Deposit on a behalf of the partner and also specify the pool staking time ID
      const result = await rocketPartnerAPI.APIpartnerDeposit(partnerFirstUserAccount, 'short', {
        from: partnerFirst,
        value: sendAmount,
        gas: rocketDepositGas,
      });

      const log = result.logs.find(({ event }) => event == 'APIpartnerDepositAccepted');
      assert.notEqual(log, undefined); // Check that an event was logged

      const userPartnerAddress = log.args._partner;

      // Now find the pools our users belongs too, should just be one
      const pools = await rocketPool.getPoolsFilterWithUser
        .call(partnerFirstUserAccount, { from: partnerFirst })
        .valueOf();

      // Get an instance of that pool and do further checks
      const miniPool = RocketPoolMini.at(pools[0]);
      const poolStatus = await miniPool.getStatus.call().valueOf();
      const poolBalance = web3.eth.getBalance(miniPool.address).valueOf();

      // Now just count the users to make sure this user is the only one in this new pool
      const userCount = await miniPool.getUserCount.call().valueOf();

      assert.equal(poolStatus, 0, 'Invalid pool status');
      assert.equal(poolBalance, sendAmount, 'Pool balance and send amount does not match');
      assert.equal(userPartnerAddress, partnerFirst, 'Partner address does not match');
      assert.equal(pools.length, 1, 'Final number of pools does not match');
    }
  );

  // First partner withdraws half their users previous Ether from the pool before it has launched for staking
  it(printTitle('partnerFirst', 'withdraws half their users previous deposit from the minipool'), async () => {
    // Get the user deposit total
    const pools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount).valueOf();
    assert.equal(pools.length, 1);

    // Get an instance of that pool and do further checks
    const miniPool = RocketPoolMini.at(pools[0]);
    const poolStatus = await miniPool.getStatus.call().valueOf();

    // Get the user deposit
    const depositedAmount = await miniPool.getUserDeposit.call(partnerFirstUserAccount).valueOf();
    const withdrawalAmount = depositedAmount / 2;

    // Withdraw half our deposit now through the main parent contract
    await rocketPartnerAPI.APIpartnerWithdrawal(miniPool.address, withdrawalAmount, partnerFirstUserAccount, {
      from: partnerFirst,
      gas: 4000000,
    });

    // Get our balance again
    const depositedAmountAfter = await miniPool.getUserDeposit.call(partnerFirstUserAccount).valueOf();

    assert.equal(depositedAmountAfter, depositedAmount - withdrawalAmount, 'Deposited amoint does not match');
  });

  // First partner user withdraws the remaining deposit from the minipool, their user is removed from it and the minipool is destroyed as it has no users anymore
  it(
    printTitle(
      'partnerFirst',
      'withdraws their users remaining deposit from the minipool, their user is removed from it and the minipool is destroyed as it has no users anymore'
    ),
    async () => {
      // Get the users deposit total
      const pools = await rocketPool.getPoolsFilterWithUserDeposit.call(partnerFirstUserAccount).valueOf();
      assert.equal(pools.length, 1);

      // Get an instance of that pool and do further checks
      const miniPool = RocketPoolMini.at(pools[0]);
      const depositedAmount = await miniPool.getUserDeposit.call(partnerFirstUserAccount).valueOf();
      const withdrawalAmount = depositedAmount;

      // Withdraw our deposit now through the main parent contract
      await rocketPartnerAPI.APIpartnerWithdrawal(miniPool.address, withdrawalAmount, partnerFirstUserAccount, {
        from: partnerFirst,
        gas: rocketWithdrawalGas,
      });

      // See if Rocket Pool still recognises the pool contract after its been removed and self destructed
      const result = await rocketPool.getPoolExists.call(pools[0]).valueOf();
      assert.isFalse(result, 'Minipool exists when it should have been destroyed');
    }
  );

  it(
    printTitle(
      'userThird',
      'sends a lot of ether to RP, creates second minipool, registers user with pool and sets status of minipool to countdown'
    ),
    async () => {
      // Get the min ether required to launch a minipool
      const sendAmount = parseInt(await rocketSettings.getMiniPoolLaunchAmount.call().valueOf());

      const result = await rocketUser.userDeposit('short', {
        from: userThird,
        to: rocketPool.address,
        value: sendAmount,
        gas: rocketDepositGas,
      });

      const log = result.logs.find(({ event }) => event == 'Transferred');
      assert.notEqual(log, undefined); // Check that an event was logged

      const userSendAmount = parseInt(log.args.value);
      const userSendAddress = log.args._from;
      const poolAddress = log.args._to;

      // Get an instance of that pool and do further checks
      miniPoolSecond = RocketPoolMini.at(poolAddress);

      const poolStatus = await miniPoolSecond.getStatus.call();
      const poolBalance = web3.eth.getBalance(miniPoolSecond.address).valueOf();
      const userPartnerAddress = await miniPoolSecond.getUserPartner.call(userThird).valueOf();

      assert.equal(poolStatus, 1, 'Invalid minipool status');
      assert.equal(userSendAmount, sendAmount, 'Invalid user send amount');
      assert.equal(userPartnerAddress, 0, 'Invalud user partner address');
      assert.isTrue(userSendAmount > 0, 'User send amount must be more than zero');
    }
  );

  // Attempt to make a withdraw of rocket deposit tokens too early
  it(printTitle('userThird', 'fail to withdraw Rocket Deposit Tokens before pool begins staking'), async () => {
    // Try to withdraw tokens from that users' minipool
    const result = rocketUser.userWithdrawDepositTokens(miniPoolSecond.address, 0, {
      from: userThird,
      gas: 150000,
    });
    await assertThrows(result);
  });

  // Node performs first checkin, no pools should be launched yet
  it(
    printTitle(
      'nodeFirst',
      'first node performs checkin, no minipool awaiting launch should not be launched yet as the countdown has not passed for either'
    ),
    async () => {
      // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
      // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
      const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');
      // Checkin now
      const result = await rocketNode.nodeCheckin(averageLoad15mins, { from: nodeFirst, gas: nodeCheckinGas });

      const log = result.logs.find(({ event }) => event == 'NodeCheckin');
      assert.notEqual(log, undefined); // Check that an event was logged

      const nodeAddress = log.args._nodeAddress.valueOf();
      const loadAverage = log.args.loadAverage.valueOf();

      const poolCount = await rocketPool.getPoolsFilterWithNodeCount.call(nodeAddress).valueOf();

      assert.equal(nodeAddress, nodeFirst, 'Node address doesn not match');
      assert.notEqual(loadAverage, 0, 'Load average is not correct');
      assert.equal(poolCount, 0, 'Pool count is not correct');
    }
  );

  // Node performs second checkin, sets the launch time for minipools to 0 so that the first awaiting minipool is launched
  it(
    printTitle(
      'nodeFirst',
      'first node performs second checkin, 1 of the 2 minipools awaiting launch should be launched as countdown is set to 0 and balance sent to Casper'
    ),
    async () => {
      // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
      // Also Solidity doesn't deal with decimals atm, so convert to a whole number for the load
      const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

      // Set our pool launch timer to 0 setting so that will trigger its launch now rather than waiting for it to naturally pass - only an owner operation
      await rocketSettings.setMiniPoolCountDownTime(0, { from: web3.eth.coinbase, gas: 500000 });

      // Launching multiple pools at once can consume a lot of gas, estimate it first
      const gasEstimate = await rocketNode.nodeCheckin.estimateGas(averageLoad15mins, { from: nodeFirst });
      // Checkin now
      const result = await rocketNode.nodeCheckin(averageLoad15mins, {
        from: nodeFirst,
        gas: parseInt(gasEstimate) + 100000,
      });

      const log = result.logs.find(({ event }) => event == 'NodeCheckin');
      assert.notEqual(log, undefined); // Check that an event was logged

      const nodeAddress = log.args._nodeAddress;
      const loadAverage = log.args.loadAverage;

      // Check that the first minipool contract has been attached to the node
      const minipoolsAttached = await rocketPool.getPoolsFilterWithNode.call(nodeFirst).valueOf();
      // Get the balance, should be 0 as the Ether has been sent to Casper for staking
      const minipoolBalance = web3.eth.getBalance(miniPoolFirst.address).valueOf();
      const minipoolStatus = await miniPoolFirst.getStatus.call().valueOf();
      // Check its a validator in Casper
      const casperValidatorIndex = await casper.get_validator_indexes.call(miniPoolFirst.address).valueOf();
      const casperValidatorDynastyStart = await casper.get_validators__dynasty_start.call(casperValidatorIndex).valueOf();

      assert.equal(nodeAddress, nodeFirst, 'Node address does not match');
      assert.equal(loadAverage, averageLoad15mins, 'Load average does not match');
      assert.equal(minipoolsAttached.length, 1, 'Invalid number of minipools');
      assert.equal(minipoolsAttached[0], miniPoolFirst.address, 'Invalid minipool address');
      assert.equal(minipoolBalance, 0, 'Invalid minipool balance');
      assert.equal(casperValidatorIndex.valueOf(), 1, 'Invalid validator index');
      assert.equal(casperValidatorDynastyStart, 3, 'Invalid validator dynasty');
    }
  );

  // Simulate Caspers epoch and dynasty changing for the second deposit
  it(
    printTitle(
      'casper',
      'simulate Caspers epoch and dynasty changing for the second deposit'
    ),
    async () => {

      // Increment epoch
      await casper.set_increment_epoch({
        from: owner
      });

      await casper.set_increment_epoch({
        from: owner
      });
      
      // Increment dynasty 
      await casper.set_increment_dynasty({
        from: owner
      });

      await casper.set_increment_epoch({
        from: owner
      });

      // Increment dynasty 
      await casper.set_increment_dynasty({
        from: owner
      });

    }
  );

  // Node performs second checkin, sets the launch time for minipools to 0 so that the second awaiting minipool is launched
  it(
    printTitle(
      'nodeSecond',
      'second node performs first checkin, 2 of the 2 minipools awaiting launch should be launched as countdown is set to 0 and balance sent to Casper'
    ),
    async () => {
      // Our average load is determined by average load / CPU cores since it is relative to how many cores there are in a system
      // Also Solidity doesn't deal with decimals atm, so convert to a whole number for the load
      const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

      await rocketSettings.setMiniPoolCountDownTime(0, { from: web3.eth.coinbase, gas: 500000 });

      // Launching multiple pools at once can consume a lot of gas, estimate it first
      const gasEstimate = await rocketNode.nodeCheckin.estimateGas(averageLoad15mins, { from: nodeSecond });

      // Checkin now
      const result = await rocketNode.nodeCheckin(averageLoad15mins, {
        from: nodeSecond,
        gas: parseInt(gasEstimate) + 100000,
      });

      const log = result.logs.find(({ event }) => event == 'NodeCheckin');
      assert.notEqual(log, undefined); // Check that an event was logged

      const nodeAddress = log.args._nodeAddress;
      const loadAverage = log.args.loadAverage;

      // Check that the first minipool contract has been attached to the node
      const minipoolsAttached = await rocketPool.getPoolsFilterWithNode.call(nodeSecond).valueOf();
      const minipoolBalance = web3.eth.getBalance(miniPoolSecond.address).valueOf();
      const minipoolStatus = await miniPoolSecond.getStatus.call().valueOf();
      // Check its a validator in Casper
      const casperValidatorIndex = await casper.get_validator_indexes.call(miniPoolSecond.address).valueOf();
      const casperValidatorDynastyStart = await casper.get_validators__dynasty_start.call(casperValidatorIndex).valueOf();

      assert.equal(nodeAddress, nodeSecond, 'Node address does not match');
      assert.equal(loadAverage, averageLoad15mins, 'Load average does not match');
      assert.equal(minipoolsAttached.length, 1, 'Invalid number of minipools');
      assert.equal(minipoolsAttached[0], miniPoolSecond.address, 'Invalid minipool address');
      assert.equal(minipoolBalance, 0, 'Invalid minipool balance');
      assert.equal(minipoolStatus, 2, 'Invalid minipool status');
      assert.equal(casperValidatorIndex, 2, 'Invalid validator index');
      assert.equal(casperValidatorDynastyStart, 5, 'Invalid validator dynasty');
    }
  );


  it(
    printTitle(
      'userThird',
      'withdraws 50% of their deposit as Rocket Deposit Tokens while their minipool is staking with Casper'
    ),
    async () => {
      // Get the token withdrawal fee
      const tokenWithdrawalFee = await rocketSettings.getTokenRPDWithdrawalFeePerc.call().valueOf();
      // Get the total supply of tokens in circulation
      const totalTokenSupplyStr = await rocketDeposit.totalSupply.call({ from: userThird }).valueOf();
      const totalTokenSupply = parseInt(totalTokenSupplyStr);

      // Third user deposited the min required to launch a pool earlier, we need this amount so we can calculate 50%
      const userDeposit = await miniPoolSecond.getUserDeposit.call(userThird).valueOf();
      const withdrawHalfAmount = parseInt(userDeposit) / 2;
      // Fee incurred on tokens
      const tokenBalanceFeeIncurred = parseFloat(
        web3.fromWei(tokenWithdrawalFee, 'ether') * web3.fromWei(withdrawHalfAmount, 'ether')
      );

      // Try to withdraw tokens from that users minipool
      await rocketUser.userWithdrawDepositTokens(miniPoolSecond.address, withdrawHalfAmount, {
        from: userThird,
        gas: 250000,
      });

      // Get the total supply of tokens in circulation
      const tokenWeiSupplyAfter = await rocketDeposit.totalSupply({ from: userThird }).valueOf();
      const totalTokenSupplyAfter = parseFloat(web3.fromWei(tokenWeiSupplyAfter, 'ether'));

      // Now count how many tokens that user has, should match the amount withdrawn
      const userWeiBalance = await rocketDeposit.balanceOf.call(userThird).valueOf();
      const tokenBalance = parseFloat(web3.fromWei(userWeiBalance, 'ether'));

      // Now count how many tokens that user has, should match the amount withdrawn - fees
      const userBalance = await miniPoolSecond.getUserDeposit.call(userThird).valueOf();
      const expectedTokenBalance = web3.fromWei(withdrawHalfAmount, 'ether') - tokenBalanceFeeIncurred;

      assert.equal(tokenBalance, expectedTokenBalance, 'Token balance does not match');
      assert.equal(totalTokenSupplyAfter, tokenBalance, 'Token supply does not match');
      assert.equal(userBalance, withdrawHalfAmount, 'User balance does not match');
    }
  );

  it(printTitle('userThird', 'transfers half of their deposit tokens to userFirst on the open market'), async () => {
    // Count how many tokens that user has
    const userThirdTokenBalance = await rocketDeposit.balanceOf.call(userThird).valueOf();
    // Transfer half to first user on the open market
    const tokenTransferAmount = parseInt(userThirdTokenBalance) / 2;
    // Transfer now
    await rocketDeposit.transfer(userFirst, tokenTransferAmount, { from: userThird, gas: 250000 });

    // Now count how many tokens that user has
    const userThirdTokenBalanceAfter = await rocketDeposit.balanceOf.call(userThird).valueOf();
    // Now count first user balance
    const userFirstTokenBalance = await rocketDeposit.balanceOf.call(userFirst).valueOf();

    assert.equal(
      userThirdTokenBalanceAfter,
      userThirdTokenBalance - tokenTransferAmount,
      'Third user token balance does not match'
    );
    assert.equal(userFirstTokenBalance, tokenTransferAmount, 'First user token balance does not match');
  });

  it(printTitle('userThird', 'fails to transfer more tokens than they own on the open market'), async () => {
    // Count how many tokens that user has
    const userThirdTokenBalance = parseInt(await rocketDeposit.balanceOf.call(userThird).valueOf());
    // Transfer to first user on the open market
    const tokenTransferAmount = userThirdTokenBalance + 10000;
    // Transfer now
    await rocketDeposit.transfer(userFirst, tokenTransferAmount, { from: userThird, gas: 250000 });

    // Now count how many tokens that user has
    const userThirdTokenBalanceAfter = parseInt(await rocketDeposit.balanceOf.call(userThird).valueOf());

    // check that none were sent
    assert.equal(userThirdTokenBalanceAfter, userThirdTokenBalance, 'Users tokens were transferred');
  });

  it(
    printTitle('userThird', 'fails to transfer tokens from userFirst account to themselves on the open market'),
    async () => {
      // Count how many tokens that user has
      const userFirstTokenBalance = parseInt(await rocketDeposit.balanceOf.call(userFirst).valueOf());
      // Transfer to third user on the open market
      const tokenTransferAmount = userFirstTokenBalance / 2;
      // Transfer now
      await rocketDeposit.transferFrom(userFirst, userThird, tokenTransferAmount, { from: userThird, gas: 250000 });

      // Now count how many tokens that user has
      const userFirstTokenBalanceAfter = parseInt(await rocketDeposit.balanceOf.call(userFirst).valueOf());
      assert.equal(userFirstTokenBalanceAfter, userFirstTokenBalance, 'Users tokens were transferred');
    }
  );

  it(
    printTitle(
      'userThird',
      'fails to trade their tokens for ether in the rocket deposit token fund as it does not have enough ether to cover the amount sent'
    ),
    async () => {
      const userThirdTokenBalance = parseInt(await rocketDeposit.balanceOf.call(userThird).valueOf());
      // Transfer now
      const result = rocketDeposit.burnTokensForEther(userThirdTokenBalance, { from: userThird, gas: 250000 });
      await assertThrows(result);
    }
  );

  it(
    printTitle(
      'userThird',
      'withdraws the remainder of their deposit as Rocket Deposit Tokens while their minipool is staking with Casper and are removed from pool'
    ),
    async () => {
      // Get the token withdrawal fee
      const tokenWithdrawalFee = parseInt(await rocketSettings.getTokenRPDWithdrawalFeePerc.call().valueOf());

      // Withdraw all by passing 0
      await rocketUser.userWithdrawDepositTokens(miniPoolSecond.address, 0, { from: userThird, gas: 250000 });

      // User should be removed from pool now as they dont have any deposit left, they traded it all for deposit tokens
      const result = miniPoolSecond.getUserDeposit.call(userThird);
      await assertThrows(result);
    }
  );

  // First user with deposit staking in minipool attempts to withdraw deposit before staking has finished
  it(printTitle('userFirst', 'user fails to withdraw deposit while minipool is staking'), async () => {
    // Attempt withdrawal of all our deposit now
    const result = rocketUser.userWithdraw(miniPoolFirst.address, 0, {
      from: userFirst,
      gas: rocketWithdrawalGas,
    });
    await assertThrows(result);
  });

  // Node performs checkin
  it(
    printTitle(
      'nodeFirst',
      'first node performs another checkin, first minipool currently staking should remain staking on it'
    ),
    async () => {
      const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');
      await rocketNode.nodeCheckin(averageLoad15mins, { from: nodeFirst, gas: nodeCheckinGas });

      // Status = 2? Still staking
      const miniPoolStatus = await miniPoolFirst.getStatus.call().valueOf();
      // Get the balance, should be 0 as the Ether has been sent to Casper for staking
      const miniPoolBalance = web3.eth.getBalance(miniPoolFirst.address).valueOf();

      assert.equal(miniPoolStatus, 2, 'Invalid minipool status');
      assert.equal(miniPoolBalance, 0, 'Invalid minipool balance');
    }
  );

  // Update first minipool
  it(printTitle('---------', 'first minipool has staking duration set to 0'), async () => {
    // Set the minipool staking duration to 0 for testing so it will attempt to request withdrawal from Casper
    await rocketPool.setPoolStakingDuration(miniPoolFirst.address, 0, { from: owner, gas: 150000 });
    // TODO: check pool staking duration, dummy test for now
  });

  // Update second minipool
  it(printTitle('---------', 'second minipool has staking duration set to 0'), async () => {
    // Set the minipool staking duration to 0 for testing so it will attempt to request withdrawal from Casper
    await rocketPool.setPoolStakingDuration(miniPoolSecond.address, 0, { from: owner, gas: 150000 });
    // TODO: check pool staking duration, dummy test for now
  });

  // Simulate Caspers epoch and dynasty changing to allow withdrawals
  it(
    printTitle(
      'casper',
      'simulate Caspers epoch and dynasty changing to allow withdrawals'
    ),
    async () => {

      // Increment epoch
      await casper.set_increment_epoch({
        from: owner
      });

      await casper.set_increment_epoch({
        from: owner
      });
      
      // Increment dynasty 
      await casper.set_increment_dynasty({
        from: owner
      });

    }
  );


  // Node performs checkin
  it(
    printTitle(
      'nodeFirst',
      'first node performs another checkin after both minipools have staking duration set to 0. Only minipool attached to first node will signal logged out from Casper.'
    ),
    async () => {
      const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

      // Checkin now
      await rocketNode.nodeCheckin(averageLoad15mins, { from: nodeFirst, gas: nodeCheckinGas });

      // Status = 3? Awaiting withdrawal from Casper
      const miniPoolStatusFirst = await miniPoolFirst.getStatus.call().valueOf();
      const miniPoolStatusSecond = await miniPoolSecond.getStatus.call().valueOf();

      assert.equal(miniPoolStatusFirst, 3, 'First minipool invalid status');
      assert.equal(miniPoolStatusSecond, 2, 'Second minipool invalid status');
    }
  );

  // Node performs checkin
  it(
    printTitle(
      'nodeSecond',
      'second node performs another checkin after both minipools have staking duration set to 0. Only minipool attached to second node will signal logged out from Casper.'
    ),
    async () => {
      const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

      // Checkin now
      await rocketNode.nodeCheckin(averageLoad15mins, { from: nodeSecond, gas: nodeCheckinGas });

      const miniPoolStatusFirst = await miniPoolFirst.getStatus.call().valueOf();
      const miniPoolStatusSecond = await miniPoolSecond.getStatus.call().valueOf();

      assert.equal(miniPoolStatusFirst, 3, 'First minipool invalid status');
      assert.equal(miniPoolStatusSecond, 3, 'Second minipool invalid status');
    }
  );



  // Simulate Caspers epoch and dynasty changing for the second deposit
  it(
    printTitle(
      'casper',
      'simulate Caspers epoch and dynasty incrementing to allow first minipool validator to withdraw'
    ),
    async () => {
      
      // Increment epoch
      await casper.set_increment_epoch({
        from: owner
      });

      await casper.set_increment_epoch({
        from: owner
      });

      // Increment dynasty 
      await casper.set_increment_dynasty({
        from: owner
      });

      await casper.set_increment_epoch({
        from: owner
      });

      // Increment dynasty 
      await casper.set_increment_dynasty({
        from: owner
      });

      await casper.set_increment_epoch({
        from: owner
      });

      // Increment dynasty 
      await casper.set_increment_dynasty({
        from: owner
      });

      await casper.set_increment_epoch({
        from: owner
      });

      await casper.set_increment_epoch({
        from: owner
      });

    }
  );


  // Node performs checkin
  it(
    printTitle(
      'nodeFirst',
      'first node performs another checkin and first minipool to change status and request actual deposit withdrawal from Casper'
    ),
    async () => {
      // Our average load (simplified) is determined by average load / CPU cores since it is relative to how many cores there are in a system
      // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
      const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

      // Checkin now
      await rocketNode.nodeCheckin(averageLoad15mins, { from: nodeFirst, gas: 950000 });

      // Check the status of the first pool
      const miniPoolStatusFirst = await miniPoolFirst.getStatus.call();
      // Get the balance, should be 0 as the Ether has been sent to Casper for staking
      const miniPoolBalanceFirst = web3.eth.getBalance(miniPoolFirst.address);
      // Check the status of the second pool
      const miniPoolStatusSecond = await miniPoolSecond.getStatus.call();
      // Get the balance, should be 0 as the Ether has been sent to Casper for staking
      const miniPoolBalanceSecond = web3.eth.getBalance(miniPoolSecond.address);

      assert.equal(miniPoolStatusFirst.valueOf(), 4, 'Invalid first minipool status');
      assert.isTrue(miniPoolBalanceFirst.valueOf() > 0, 'Invalid first minipool balance');
      assert.equal(miniPoolStatusSecond.valueOf(), 3, 'Invalid second minipool status');
      assert.equal(miniPoolBalanceSecond.valueOf(), 0, 'Invalid second minipool balance');
    }
  );


  // Node performs checkin
  it(
    printTitle(
      'nodeFirst',
      'first node performs another checkin and second minipool requests deposit from Casper, receives it then closes the pool as all users have withdrawn deposit as tokens'
    ),
    async () => {
      // Our average load (simplified) is determined by average load / CPU cores since it is relative to how many cores there are in a system
      // Also Solidity doesn't deal with decimals atm, so convert to a whole wei number for the load
      const averageLoad15mins = web3.toWei(os.loadavg()[2] / os.cpus().length, 'ether');

      // Checkin now
      await rocketNode.nodeCheckin(averageLoad15mins, { from: nodeFirst, gas: 950000 });

      // Status = 4? Received deposit from casper + rewards
      const miniPoolStatusFirst = await miniPoolFirst.getStatus.call().valueOf();
      // Get the balance, should be 0 as the Ether has been sent to Casper for staking
      const miniPoolBalanceFirst = web3.eth.getBalance(miniPoolFirst.address).valueOf();

      // Second minipool should have closed and it's balance is 0 as all users have withdrawn ether as RPD tokens
      const miniPoolBalanceSecond = web3.eth.getBalance(miniPoolSecond.address).valueOf();

      assert.equal(miniPoolStatusFirst, 4, 'Invalid first minipool status');
      assert.isTrue(miniPoolBalanceFirst > 0, 'Invalid first minipool balance');
      assert.equal(miniPoolBalanceSecond, 0, 'Invalid second minipool balance');
    }
  );

  it(
    printTitle('---------', 'all of userThirds withdrawn token backed ethers should be in the deposit token fund now'),
    async () => {
      // Get the min ether required to launch a minipool - the user sent half this amount for tokens originally
      const etherAmountTradedSentForTokens = parseInt(await rocketSettings.getMiniPoolLaunchAmount.call().valueOf());
      const depositTokenFundBalance = web3.eth.getBalance(rocketDeposit.address).valueOf();
      assert.equal(
        depositTokenFundBalance,
        etherAmountTradedSentForTokens,
        'Deposit token fund balance does not match'
      );
    }
  );

  it(
    printTitle('userFirst', 'burns their deposit tokens received from userThird in return for ether + bonus'),
    async () => {
      // Get the token withdrawal fee
      const tokenWithdrawalFeeWei = await rocketSettings.getTokenRPDWithdrawalFeePerc.call().valueOf();
      // Token fee - this goes to the person who trades the tokens back in
      const tokenWithdrawalFee = parseFloat(web3.fromWei(tokenWithdrawalFeeWei, 'ether'));
      // Get the total supply of tokens in circulation
      const fundTokenBalance = parseFloat(await rocketDeposit.totalSupply.call().valueOf());

      // Now count how many tokens that user has
      const userFirstTokenBalance = parseFloat(await rocketDeposit.balanceOf.call(userFirst).valueOf());
      const userFirstEtherBalance = web3.eth.getBalance(userFirst).valueOf();
      const burnGas = 250000;

      // Transfer now
      await rocketDeposit.burnTokensForEther(userFirstTokenBalance, { from: userFirst, gas: burnGas });

      // Now count how many tokens that user has, should be none
      const userFirstTokenBalanceAfter = parseFloat(await rocketDeposit.balanceOf.call(userFirst).valueOf());
      const userFirstEtherBalanceAfter = web3.eth.getBalance(userFirst).valueOf();

      const fundTokenBalanceAfter = parseFloat(await rocketDeposit.totalSupply.call().valueOf());
      const etherAccountDiff = userFirstEtherBalanceAfter - userFirstEtherBalance;

      assert.equal(userFirstTokenBalanceAfter, 0, 'User balance should be zero');
      assert.equal(fundTokenBalanceAfter, fundTokenBalance - userFirstTokenBalance, 'Fund token balance did not match');
      assert.notEqual(etherAccountDiff, 0, 'Account balance did not change');
    }
  );

  // Owner attempts to remove active node
  it(
    printTitle('owner', 'fails to remove first node from the Rocket Pool network as it has minipools attached to it'),
    async () => {
      // Remove the node now
      const result = rocketNode.nodeRemove(nodeFirst, { from: owner, gas: 200000 });
      await assertThrows(result);
    }
  );


  // First user withdraws their deposit + rewards and pays Rocket Pools fee
  it(
    printTitle('userFirst', 'withdraws their deposit + Casper rewards from the minipool and pays their fee'),
    async () => {
      // Get the user deposit
      const depositedAmount = await miniPoolFirst.getUserDeposit.call(userFirst).valueOf();
      // Fee acount is Coinbase by default
      const rpFeeAccountBalancePrev = web3.eth.getBalance(owner).valueOf();
      // Get the minipool balance
      const miniPoolBalancePrev = web3.eth.getBalance(miniPoolFirst.address).valueOf();

      // Withdraw our total deposit + rewards
      const result = await rocketUser.userWithdraw(miniPoolFirst.address, 0, {
        from: userFirst,
        gas: rocketWithdrawalGas,
      });

      const log = result.logs.find(({ event }) => event == 'Transferred');
      assert.notEqual(log, undefined); // Check that an event was logged

      const amountSentToUser = log.args.value;

      // Fee acount is Coinbase by default
      const rpFeeAccountBalance = web3.eth.getBalance(owner).valueOf();
      // Get the minipool balance
      const miniPoolBalance = web3.eth.getBalance(miniPoolFirst.address).valueOf();
      // Now just count the users to make sure this user has been removed after withdrawing their balance and paying the fee
      const userCount = await miniPoolFirst.getUserCount.call().valueOf();

      assert.isTrue(depositedAmount < amountSentToUser, 'Deposit amount did not decrease');
      assert.isTrue(rpFeeAccountBalance > rpFeeAccountBalancePrev, 'Fee account balance did not increase');
      assert.isTrue(miniPoolBalance < miniPoolBalancePrev, 'Minipool balance did not decrease');
      assert.equal(userCount, 1, 'User count does not match');
    }
  );

  // Second user attempts to withdraw using their backup address before the time limit to do so is allowed (3 months by default)
  it(
    printTitle('userSecond', 'fails to withdraw using their backup address before the time limit to do so is allowed'),
    async () => {
      // Attemp tp withdraw our total deposit + rewards using our backup address
      const result = rocketUser.userWithdraw(miniPoolFirst.address, 0, {
        from: userSecondBackupAddress,
        gas: rocketWithdrawalGas,
      });
      await assertThrows(result);
    }
  );
  

  // Update first minipool
  it(
    printTitle(
      '---------',
      'settings BackupCollectTime changed to 0 which will allow the user to withdraw via their backup address'
    ),
    async () => {
      // Set the backup withdrawal period to 0 to allow the user to withdraw using their backup address
      const result = await rocketSettings.setMiniPoolBackupCollectTime(0, { from: owner, gas: 150000 });
      // TODO: check backup withdrawal period, dummy test for now
    }
  );

  // First user attempts to withdraw again
  it(
    printTitle('userFirst', "fails to withdraw again from the pool as they've already completed withdrawal"),
    async () => {
      // Attempt to withdraw our total deposit + rewards using our backup address
      const result = rocketUser.userWithdraw(miniPoolFirst.address, 0, {
        from: userFirst,
        gas: rocketWithdrawalGas,
      });
      await assertThrows(result);
    }
  );

  // Second user withdraws their deposit + rewards and pays Rocket Pools fee, minipool closes
  it(
    printTitle(
      'userSecond',
      'withdraws their deposit + Casper rewards using their backup address from the minipool, pays their fee and the pool closes'
    ),
    async () => {
      // Get the user deposit
      const depositedAmount = await miniPoolFirst.getUserDeposit.call(userSecond).valueOf();
      // Fee account is Coinbase by default
      const rpFeeAccountBalancePrev = web3.eth.getBalance(owner).valueOf();
      // Get the minipool balance
      const miniPoolBalancePrev = web3.eth.getBalance(miniPoolFirst.address).valueOf();

      // Withdraw our total deposit + rewards
      const result = await rocketUser.userWithdraw(miniPoolFirst.address, 0, {
        from: userSecondBackupAddress,
        gas: rocketWithdrawalGas,
      });

      const log = result.logs.find(({ event }) => event == 'Transferred');
      assert.notEqual(log, undefined); // Check that an event was logged

      const amountSentToUser = log.args.value;

      // Fee acount is the coinbase by default
      const rpFeeAccountBalance = web3.eth.getBalance(owner).valueOf();
      // Get the minipool balance
      const miniPoolBalance = web3.eth.getBalance(miniPoolFirst.address).valueOf();


      // See if RocketStorage still recognises the pool contract after its been removed and self destructed
      const poolExists = await rocketPool.getPoolExists.call(miniPoolFirst.address).valueOf();

      assert.isTrue(depositedAmount < amountSentToUser, 'Deposit balance did not decrease');
      assert.isTrue(rpFeeAccountBalance > rpFeeAccountBalancePrev, 'Fee account balance did not increase');
      assert.isTrue(miniPoolBalance == 0, 'Minipool balance is not equal to zero');
      assert.isFalse(poolExists, 'Pool exists when it should have been destroyed');
    }
  );

  // Owner removes first node
  it(printTitle('owner', 'removes first node from the Rocket Pool network'), async () => {
    // Remove the node now
    const result = await rocketNode.nodeRemove(nodeFirst, { from: owner, gas: 200000 });

    const log = result.logs.find(({ event }) => event == 'NodeRemoved');
    assert.notEqual(log, undefined); // Check that an event was logged

    const nodeAddress = log.args._address;
    assert.equal(nodeAddress, nodeFirst, 'Node address does not match');
  });

  // Owner removes first partner - users attached to this partner can still withdraw
  it(printTitle('owner', 'removes first partner from the Rocket Pool network'), async () => {
    // Check the second partner array index
    const partnerSecondIndexPrev = await rocketPartnerAPI.getPartnerIndex.call(partnerSecond).valueOf();
    // Remove the node now
    const result = await rocketPartnerAPI.partnerRemove(partnerFirst, { from: owner, gas: 500000 });

    const log = result.logs.find(({ event }) => event == 'PartnerRemoved');
    assert.notEqual(log, undefined); // Check that an event was logged

    const partnerAddress = log.args._address;

    // The partner count should be one now
    const partnerCount = await rocketPartnerAPI.getPartnerCount.call().valueOf();
    // Now check the remaining partner array was reindexed correctly using the key/value storage
    const partnerSecondIndex = await rocketPartnerAPI.getPartnerIndex.call(partnerSecond).valueOf();

    assert.equal(partnerAddress, partnerFirst, 'Partner addresses do not match');
    assert.equal(partnerCount, 1, 'Partner count is incorrect');
    assert.equal(partnerSecondIndexPrev, 1, 'Initial second partner index is incorrect');
    assert.equal(partnerSecondIndex, 0, 'New second partner index is incorrect');
  });

  // Attempt to make a deposit with after being removed as a partner
  it(printTitle('partnerFirst', 'attempt to make a deposit with after being removed as a partner'), async () => {
    // Get the min ether required to launch a minipool
    const minEther = await rocketSettings.getMiniPoolLaunchAmount.call().valueOf();
    const sendAmount = minEther - web3.toWei('1', 'ether');

    // Deposit on a behalf of the partner and also specify an incorrect pool staking time ID
    const result = rocketPartnerAPI.APIpartnerDeposit(partnerFirstUserAccount, 'short', {
      from: partnerFirst,
      value: sendAmount,
      gas: rocketDepositGas,
    });
    await assertThrows(result);
  });

  rocketVaultAdminTests({
      owner: owner,
      accounts: accounts
    });

});
