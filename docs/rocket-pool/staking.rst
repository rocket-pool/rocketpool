#######
Staking
#######


********
Overview
********

Staking is not unique to Rocket Pool, it's a feature coming to `Ethereum 2.0 <https://docs.ethhub.io/ethereum-roadmap/ethereum-2.0/proof-of-stake/>`_ in the near future.
Ethereum 2.0 will include a new chain called the Beacon Chain, which anyone can become a validator on by making a deposit (or "stake") of ether.
Validators are responsible for ensuring the integrity of the Ethereum network, and earn interest on their deposit by doing so.

The Beacon Chain will require a large sum of ether in order to become a validator, which many may not have access to.
Rocket Pool aims to solve this problem by pooling ether from multiple users together so that they can stake with less!


*******************
For Regular Stakers
*******************

Staking in Rocket Pool as a regular user is as easy as navigating to the `Rocket Pool website <https://beta.rocketpool.net/>`_, entering an amount of ETH to stake, and clicking Start!
When you stake in Rocket Pool, you will immediately receive an amount of :ref:`rETH <rocket-pool-reward-tokens-reth>` with equivalent value to the ETH you deposit.

The value of rETH accumulates over time as the network earns rewards, so all you need to do to earn a profit is hold onto it.
Once you're ready to exit, simply trade your rETH back in for ETH via the website (or on an exchange), and as long as the network has performed well, you'll end up with more than you put in!


******************
For Node Operators
******************

In order to run a node in the Rocket Pool network, you will need to install the Rocket Pool `smart node software <https://github.com/rocket-pool/smartnode-install/>`_.
The smart node client will allow you to create a new wallet for your node (to hold its Eth 1.0 account and Eth 2.0 validator keys) and register it with the Rocket Pool network.
Once your node is registered, you can deposit ETH to create :ref:`minipools <rocket-pool-minipools>` (which will have user-deposited ETH assigned to them) and begin staking.

You may deposit either 16 or 32 ETH at a time.
16 ETH deposits create minipools which must wait until 16 user-deposited ETH is assigned to them before they begin staking.
32 ETH deposits create minipools which can begin staking and earning rewards immediately.
User-deposited ETH is assigned to them later, and you are :ref:`refunded <rocket-pool-minipools-refunds>` the extra 16 ETH back to your node account.

Running a node in the Rocket Pool network is a long-term committment, as withdrawing a validator's balance will not be possible until phase 2 of the Eth 2.0 rollout.
Rocket Pool provides an option for node operators to exit and gain access to their share of a validator's balance (in the form of :ref:`nETH <rocket-pool-reward-tokens-neth>`) before phase 2, but only after a long delay.
Therefore, it is not reccommended to run a node unless you can commit to doing so over a long time period.
