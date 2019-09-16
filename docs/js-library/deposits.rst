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

    * ``deposit.getDeposits(groupId, userId, durationId)``: Get all deposits made by the specified user, via the specified group (addresses), for the specified staking duration ID (string); returns ``Promise<DepositDetails[]>``
    * ``deposit.getQueuedDeposits(groupId, userId, durationId)``: As above, but only returns deposits which are still at least partially queued.
    * ``deposit.getDeposit(depositId)``: Get the details of the deposit with the specified ID (string); returns ``Promise<DepositDetails>``
    * ``deposit.getDepositStakingPools(depositId)``: Get the details of the minipools the deposit with the specified ID (string) is assigned to; returns ``Promise<DepositPoolDetails[]>``
    * ``deposit.getDepositCount(groupId, userId, durationId)``: Get the number of deposits made by the specified user, via the specified group (addresses), for the specified staking duration ID (string); returns ``Promise<number>``
