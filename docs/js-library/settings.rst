.. _js-library-settings:

########
Settings
########


********
Overview
********

The ``settings`` module loads Rocket Pool network settings data from the chain, and is divided into 4 submodules:

    * ``settings.deposit``: Loads information on user deposit settings
    * ``settings.minipool``: Loads information on minipool settings
    * ``settings.network``: Loads information on network settings
    * ``settings.node``: Loads information on smart node settings


.. _js-library-settings-methods:

*******
Methods
*******

**Deposit Settings**:

    * ``settings.deposit.getDepositEnabled()``:
      Get whether user deposits are currently enabled; returns ``Promise<boolean>``

    * ``settings.deposit.getAssignDepositsEnabled()``:
      Get whether assignment of deposits to minipools is currently enabled; returns ``Promise<boolean>``

    * ``settings.deposit.getMinimumDeposit()``:
      Get the minimum deposit amount in wei; returns ``Promise<string>``

    * ``settings.deposit.getMaximumDepositPoolSize()``:
      Get the maximum size of the deposit pool in wei; returns ``Promise<string>``

    * ``settings.deposit.getMaximumDepositAssignments()``:
      Get the maximum number of deposit assignments to perform per transaction; returns ``Promise<number>``

**Minipool Settings**:

    * ``settings.minipool.getLaunchBalance()``:
      Get the required balance of a minipool for launch in wei; returns ``Promise<string>``

    * ``settings.minipool.getFullDepositNodeAmount()``:
      Get the amount of eth in wei to be deposited by a node for a "full" deposit; returns ``Promise<string>``

    * ``settings.minipool.getHalfDepositNodeAmount()``:
      Get the amount of eth in wei to be deposited by a node for a "half" deposit; returns ``Promise<string>``

    * ``settings.minipool.getEmptyDepositNodeAmount()``:
      Get the amount of eth in wei to be deposited by a node for an "empty" deposit; returns ``Promise<string>``

    * ``settings.minipool.getFullDepositUserAmount()``:
      Get the amount of eth in wei to be deposited by RP users for a "full" deposit; returns ``Promise<string>``

    * ``settings.minipool.getHalfDepositUserAmount()``:
      Get the amount of eth in wei to be deposited by RP users for a "half" deposit; returns ``Promise<string>``

    * ``settings.minipool.getEmptyDepositUserAmount()``:
      Get the amount of eth in wei to be deposited by RP users for an "empty" deposit; returns ``Promise<string>``

    * ``settings.minipool.getSubmitWithdrawableEnabled()``:
      Get whether submission of minipool withdrawable status is enabled; returns ``Promise<boolean>``

    * ``settings.minipool.getLaunchTimeout()``:
      Get the timeout period in blocks for minipools to launch within; returns ``Promise<number>``

    * ``settings.minipool.getWithdrawalDelay()``:
      Get the delay in blocks before nodes can withdraw nETH from minipools; returns ``Promise<number>``

**Network Settings**:

    * ``settings.network.getNodeConsensusThreshold()``:
      Get the threshold of watchtower node submissions for consensus as a fraction of 1; returns ``Promise<number>``

    * ``settings.network.getSubmitBalancesEnabled()``:
      Get whether network balance submission is enabled; returns ``Promise<boolean>``

    * ``settings.network.getSubmitBalancesFrequency()``:
      Get the frequency at which network balances are submitted in blocks; returns ``Promise<number>``

    * ``settings.network.getProcessWithdrawalsEnabled()``:
      Get whether processing validator withdrawals is enabled; returns ``Promise<boolean>``

    * ``settings.network.getMinimumNodeFee()``:
      Get the minimum node commission rate as a fraction of 1; returns ``Promise<number>``

    * ``settings.network.getTargetNodeFee()``:
      Get the target node commission rate as a fraction of 1; returns ``Promise<number>``

    * ``settings.network.getMaximumNodeFee()``:
      Get the maximum node commission rate as a fraction of 1; returns ``Promise<number>``

    * ``settings.network.getNodeFeeDemandRange()``:
      Get the range of node demand values in wei to base fee calculations on; returns ``Promise<string>``

    * ``settings.network.getTargetRethCollateralRate()``:
      Get the target rETH contract collateral rate as a fraction of 1; returns ``Promise<number>``

**Node Settings**:

    * ``settings.node.getRegistrationEnabled()``:
      Get whether node registrations are currently enabled; returns ``Promise<boolean>``

    * ``settings.node.getDepositEnabled()``:
      Get whether node deposits are currently enabled; returns ``Promise<boolean>``
