########
Deposits
########


********
Overview
********

The ``deposit`` module loads user deposit data from the chain.
This includes user deposits made via any group (Rocket Pool or other third party groups).
It does not include node deposits (made by node operators to create minipools).


**********
Data Types
**********

``DepositDetails`` objects define the various details of a user deposit::

    DepositDetails {
        id              // The 32-byte deposit ID as a string
        totalAmount     // The total amount of ether deposited (in wei)
        queuedAmount    // The amount of the deposit still remaining in the queue (in wei)
        stakingAmount   // The amount of the deposit assigned to minipools for staking (in wei)
        refundedAmount  // The amount of the deposit which has been refunded (in wei)
        withdrawnAmount // The amount of the deposit which has been withdrawn (in wei)
        pools           // An array of DepositPoolDetails objects
        backupAddress   // The backup withdrawal address set for the deposit, or null
    }

``DepositPoolDetails`` objects define the details for a minipool which a deposit is (fully or partially) assigned to::

    DepositPoolDetails {
        address         // The address of the minipool assigned to
        stakingAmount   // The amount of the deposit which is assigned to this minipool
    }


*******
Methods
*******

    * ``deposit.getDeposits(groupId, userId, durationId)``:
      Get all deposits made by the specified user, via the specified group (addresses), for the specified staking duration ID (string); returns ``Promise<DepositDetails[]>``
    * ``deposit.getQueuedDeposits(groupId, userId, durationId)``:
      As above, but only returns deposits which are still at least partially queued
    * ``deposit.getDeposit(depositId)``:
      Get the details of the deposit with the specified ID (string); returns ``Promise<DepositDetails>``
    * ``deposit.getDepositStakingPools(depositId)``:
      Get the details of the minipools the deposit with the specified ID (string) is assigned to; returns ``Promise<DepositPoolDetails[]>``
    * ``deposit.getDepositCount(groupId, userId, durationId)``:
      Get the number of deposits made by the specified user, via the specified group (addresses), for the specified staking duration ID (string); returns ``Promise<number>``
    * ``deposit.getDepositAt(groupId, userId, durationId, index)``:
      Get the ID of the deposit made by the specified user, via the specified group (addresses), for the specified staking duration ID (string), at the specified index (number); returns ``Promise<string>``
    * ``deposit.getQueuedDepositCount(groupId, userId, durationId)``:
      As above, but only returns the number of deposits which are still at least partially queued
    * ``deposit.getQueuedDepositAt(groupId, userId, durationId, index)``:
      As above, but only returns the ID if a deposit which is still at least partially queued
    * ``deposit.getDepositTotalAmount(depositId)``:
      Get the total amount of a deposit by ID (string) in wei; returns ``Promise<string>``
    * ``deposit.getDepositQueuedAmount(depositId)``:
      Get the amount of a deposit by ID (string) still remaining in the queue, in wei; returns ``Promise<string>``
    * ``deposit.getDepositStakingAmount(depositId)``:
      Get the amount of a deposit by ID (string) assigned to minipools for staking, in wei; returns ``Promise<string>``
    * ``deposit.getDepositRefundedAmount(depositId)``:
      Get the amount of a deposit by ID (string) which has been refunded, in wei; returns ``Promise<string>``
    * ``deposit.getDepositWithdrawnAmount(depositId)``:
      Get the amount of a deposit by ID (string) which has been withdrawn, in wei; returns ``Promise<string>``
    * ``deposit.getDepositStakingPoolCount(depositId)``:
      Get the number of minipools a deposit is staking under by ID (string); returns ``Promise<number>``
    * ``deposit.getDepositStakingPoolAt(depositId, index)``:
      Get the address of a minipool with the specified index (number) that the deposit with the specified ID (string) is staking under; returns ``Promise<string>``
    * ``deposit.getDepositStakingPoolAmount(depositId, minipoolAddress)``:
      Get the amount of a deposit by ID (string) that has been assigned to the minipool with the specified address (string) for staking, in wei; returns ``Promise<string>``
    * ``deposit.getDepositBackupAddress(depositId)``:
      Get the backup withdrawal address of a deposit by ID (string); returns ``Promise<string | null>``
