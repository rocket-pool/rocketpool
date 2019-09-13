###############
Getting Started
###############


************
Installation
************

The Rocket Pool JavaScript library can be added to your application via NPM, and requires `web3.js <https://github.com/ethereum/web3.js/>`_::

    npm install github:rocket-pool/rocketpool-js
    npm install web3


**************
Initialisation
**************

The library must be initialised with a web3 instance and a ``RocketStorage`` truffle contract artifact::

    import Web3 from 'web3';
    import RocketPool from 'rocketpool';
    import RocketStorage from './contracts/RocketStorage.json';

    const web3 = new Web3('http://localhost:8545');

    const rp = new RocketPool(web3, RocketStorage);


*****
Usage
*****

The Rocket Pool library is divided into several modules, each for interacting with a different aspect of the network:

    * ``rp.contracts``: Handles dynamic loading of the Rocket Pool contracts
    * ``rp.deposit``: Manages user deposits
    * ``rp.group``: Manages groups registered with Rocket Pool
    * ``rp.node``: Manages the nodes making up the Rocket Pool network
    * ``rp.pool``: Manages the main minipool registry and individual minipools
    * ``rp.settings.deposit``: Provides information on user deposit settings
    * ``rp.settings.group``: Provides information on group settings
    * ``rp.settings.minipool``: Provides information on minipool settings
    * ``rp.settings.node``: Provides information on smart node settings
    * ``rp.tokens.reth``: Manages rETH token interactions
    * ``rp.tokens.rpl``: Manages RPL token interactions

All methods typically return promises due to the asynchronous nature of working with the Ethereum network.
Getters return promises which resolve to their value, while mutators (methods which send transactions) return promises which resolve to a transaction receipt.
Mutators also accept an ``onConfirmation`` callback handler to handle specific confirmation numbers on transactions.

When using the Rocket Pool library in your project, you may handle the promises returned in the traditional way, or use async/await syntax if supported, e.g.::

    rp.contracts.get('rocketPool')
        .then(rocketPool => rocketPool.methods.getPoolsCount().call())
        .then(poolsCount => { console.log(poolsCount); });

or::

    let rocketPool = await rp.contracts.get('rocketPool');
    let poolsCount = await rocketPool.methods.getPoolsCount().call();
    console.log(poolsCount);
