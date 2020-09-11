.. _js-library-getting-started:

###############
Getting Started
###############


.. _js-library-getting-started-installation:

************
Installation
************

The Rocket Pool JavaScript library can be added to your application via NPM, and requires `web3.js <https://github.com/ethereum/web3.js/>`_::

    npm install github:rocket-pool/rocketpool-js
    npm install web3


.. _js-library-getting-started-initialization:

**************
Initialization
**************

The library must be initialized with a web3 instance and a `Truffle <https://github.com/trufflesuite/truffle>`_ ``RocketStorage`` contract artifact::

    import Web3 from 'web3';
    import RocketPool from 'rocketpool';
    import RocketStorage from './contracts/RocketStorage.json';

    const web3 = new Web3('http://localhost:8545');

    const rp = new RocketPool(web3, RocketStorage);


.. _js-library-getting-started-usage:

*****
Usage
*****

The Rocket Pool library is divided into several modules, each for interacting with a different aspect of the network:

    * ``contracts``: Handles dynamic loading of the Rocket Pool contracts
    * ``deposit``: Handles user deposits
    * ``minipool``: Manages minipools in the Rocket Pool network
    * ``network``: Handles miscellaneous network functionality
    * ``node``: Manages the nodes making up the Rocket Pool network
    * ``settings.deposit``: Provides information on user deposit settings
    * ``settings.minipool``: Provides information on minipool settings
    * ``settings.network``: Provides information on network settings
    * ``settings.node``: Provides information on smart node settings
    * ``tokens.neth``: Manages nETH token interactions
    * ``tokens.reth``: Manages rETH token interactions

All methods typically return promises due to the asynchronous nature of working with the Ethereum network.
Getters return promises which resolve to their value, while mutators (methods which send transactions) return promises which resolve to a transaction receipt.
Mutators also accept a transaction options object, and an ``onConfirmation`` callback handler to handle specific confirmation numbers on transactions.

When using the Rocket Pool library in your project, you may handle the promises returned in the traditional way, or use async/await syntax if supported, e.g.::

    rp.contracts.get('rocketDepositPool')
        .then(rocketDepositPool => rocketDepositPool.methods.getBalance().call())
        .then(balance => { console.log(balance); });

or::

    let rocketDepositPool = await rp.contracts.get('rocketDepositPool');
    let balance = await rocketDepositPool.methods.getBalance().call();
    console.log(balance);
