.. _js-library-network:

#######
Network
#######


********
Overview
********

The ``network`` module loads miscellaneous network data from the chain.
It also provides some watchtower node functionality.


.. _js-library-network-methods:

*******
Methods
*******

    * ``network.getBalancesBlock()``:
      Get the block that current network balances are set for; returns ``Promise<number>``

    * ``network.getTotalETHBalance()``:
      Get the total ETH value of the network in wei; returns ``Promise<string>``

    * ``network.getStakingETHBalance()``:
      Get the total amount of actively staking ETH in the network in wei; returns ``Promise<string>``

    * ``network.getTotalRETHSupply()``:
      Get the last recorded total rETH token supply in the network in wei; returns ``Promise<string>``

    * ``network.getETHUtilizationRate()``:
      Get the proportion of ETH in the network which is actively staking, as a fraction of 1; returns ``Promise<number>``

    * ``network.getNodeDemand()``:
      Get the current network node demand in wei; returns ``Promise<string>``

    * ``network.getNodeFee()``:
      Get the current network node commission rate as a fraction of 1; returns ``Promise<number>``

    * ``network.getNodeFeeByDemand(demand)``:
      Get the network node commission rate for a specified node demand value (in wei); returns ``Promise<number>``

    * ``network.getWithdrawalBalance()``:
      Get the current ETH balance of the network withdrawal pool in wei; returns ``Promise<string>``

    * ``network.getWithdrawalCredentials()``:
      Get the network-wide withdrawal credentials submitted for all validators; returns ``Promise<string>``

    * ``network.submitBalances(block, totalEthWe, stakingEthWei, rethSupplyWei, options, onConfirmation)``:
      Submit network balances (watchtower nodes only); returns ``Promise<TransactionReceipt>``

    * ``network.processWithdrawal(validatorPubkey, options, onConfirmation)``:
      Process a validator withdrawal (watchtower nodes only); returns ``Promise<TransactionReceipt>``
