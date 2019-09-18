########
Settings
########


********
Overview
********

The ``settings`` module loads Rocket Pool network settings data from the chain, and is divided into 4 submodules:

    * ``settings.deposit``: Loads information on user deposit settings
    * ``settings.group``: Loads information on group settings
    * ``settings.minipool``: Loads information on minipool settings
    * ``settings.node``: Loads information on smart node settings


*******
Methods
*******

**Deposit Settings**:

    * ``settings.deposit.getDepositAllowed()``
      Get whether user deposits are currently enabled; returns ``Promise<boolean>``

    * ``settings.deposit.getDepositChunkSize()``
      Get the 'chunk' size to divide deposits into in wei; returns ``Promise<string>``

    * ``settings.deposit.getDepositMin()``
      Get the minimum deposit amount in wei; returns ``Promise<string>``

    * ``settings.deposit.getDepositMax()``
      Get the maximum deposit amount in wei; returns ``Promise<string>``

    * ``settings.deposit.getChunkAssignMax()``
      Get the maximum number of chunks that are assigned per deposit transaction; returns ``Promise<number>``

    * ``settings.deposit.getDepositQueueSizeMax()``
      Get the maximum size of the deposit queue before user deposits are restricted or disabled, in wei; returns ``Promise<string>``

    * ``settings.deposit.getRefundDepositAllowed()``
      Get whether queued or stalled deposit refunds are currently enabled; returns ``Promise<boolean>``

    * ``settings.deposit.getWithdrawalAllowed()``
      Get whether deposit withdrawals are currently enabled; returns ``Promise<boolean>``

    * ``settings.deposit.getStakingWithdrawalFeePerc()``
      Get the fee charged to deposits withdrawn from a staking minipool as a fraction; returns ``Promise<number>``

    * ``settings.deposit.getCurrentDepositMax(durationId)``
      Get the current maximum deposit amount for the specified staking duration (string) in wei; returns ``Promise<string>``

**Group Settings**:

    * ``settings.group.getDefaultFee()``
      Get the default fee Rocket Pool charges to group users as a fraction of rewards; returns ``Promise<number>``

    * ``settings.group.getMaxFee()``
      Get the maximum fee Rocket Pool can charge to group users as a fraction of rewards; returns ``Promise<number>``

    * ``settings.group.getNewAllowed()``
      Get whether new group creation is enabled; returns ``Promise<boolean>``

    * ``settings.group.getNewFee()``
      Get the fee required for new groups to be registered in wei; returns ``Promise<string>``

    * ``settings.group.getNewFeeAddress()``
      Get the address that group registration fees are sent to; returns ``Promise<string>``

**Minipool Settings**:

    * ``settings.minipool.getMinipoolLaunchAmount()``
      Get the amount of ether required to launch a minipool (depositing it into the beacon chain) in wei; returns ``Promise<string>``

    * ``settings.minipool.getMinipoolCanBeCreated()``
      Get whether new minipool creation is currently possible; returns ``Promise<boolean>``

    * ``settings.minipool.getMinipoolNewEnabled()``
      Get whether new minipool creation is currently enabled; returns ``Promise<boolean>``

    * ``settings.minipool.getMinipoolClosingEnabled()``
      Get whether minipools can currently be closed; returns ``Promise<boolean>``

    * ``settings.minipool.getMinipoolMax()``
      Get the maximum number of minipools in the network (0 = unlimited); returns ``Promise<number>``

    * ``settings.minipool.getMinipoolWithdrawalFeeDepositAddress()``
      Get the address that Rocket Pool fees are sent to; returns ``Promise<string>``

    * ``settings.minipool.getMinipoolTimeout()``
      Get the period in seconds after which a minipool will time out if it has not begun staking; returns ``Promise<number>``

    * ``settings.minipool.getMinipoolActiveSetSize()``
      Get the maximum size of the active minipool set (the set of minipools that deposits are assigned to); returns ``Promise<number>``

    * ``settings.minipool.getMinipoolStakingDuration(durationId)``
      Get the staking duration for the specified duration ID in blocks; returns ``Promise<number>``

**Node Settings**:

    * ``settings.node.getNewAllowed()``
      Get whether new node registration is currently enabled; returns ``Promise<boolean>``

    * ``settings.node.getEtherMin()``
      Get the minimum ether required for a new node account to register, in wei; returns ``Promise<string>``

    * ``settings.node.getInactiveAutomatic()``
      Get whether nodes are automatically made inactive after failing to check in; returns ``Promise<boolean>``

    * ``settings.node.getInactiveDuration()``
      Get the period in seconds after which a node will be made inactive after failing to check in; returns ``Promise<number>``

    * ``settings.node.getMaxInactiveNodeChecks()``
      Get the number of other nodes that a node will check for inactivity on checkin; returns ``Promise<number>``

    * ``settings.node.getFeePerc()``
      Get the fee charged to users by nodes as a fraction of rewards; returns ``Promise<number>``

    * ``settings.node.getMaxFeePerc()``
      Get the maximum fee that can be charged to users by nodes as a fraction of rewards; returns ``Promise<number>``

    * ``settings.node.getFeeVoteCycleDuration()``
      Get the duration in seconds of a node fee voting cycle; returns ``Promise<number>``

    * ``settings.node.getFeeVoteCyclePercChange()``
      Get the amount that the node fee changes per voting cycle as a fraction of rewards; returns ``Promise<number>``

    * ``settings.node.getDepositAllowed()``
      Get whether node deposits are currently enabled; returns ``Promise<boolean>``

    * ``settings.node.getDepositReservationTime()``
      Get the duration in seconds that a deposit reservation remains valid for; returns ``Promise<number>``

    * ``settings.node.getWithdrawalAllowed()``
      Get whether node withdrawals are currently enabled; returns ``Promise<boolean>``
