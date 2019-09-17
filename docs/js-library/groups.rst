######
Groups
######


********
Overview
********

The ``group`` module manages Rocket Pool groups.
It loads group data from the chain, and can be used to register new groups and create default group accessors.
It also provides group contract functionality (for group owners to manage their group), and group accessor contract functionality (for group users to manage their deposits).


**********
Data Types
**********

``GroupDetails`` objects define the various details of a group::

    GroupDetails {
        owner           // The owner address of the group
        groupFee        // The fee charged to the group's users, as a fraction of their rewards
        rocketPoolFee   // The fee charged to the groups's users by Rocket Pool, as a fraction of their rewards
        groupFeeAddress // The address which group fees are paid to
    }

``GroupContract`` objects wrap a web3 contract instance and provide methods for managing a group.
Mutator methods are restricted to the group's owner.

``GroupAccessorContract`` objects wrap a web3 contract instance and provide methods for managing user deposits through the group.
Deposit refund and withdrawal methods are restricted to the user who made the deposit.


*******
Methods
*******

**Group Module**:

    * ``group.getName(groupId)``:
      Get the name of the group with the specified ID (contract address); returns ``Promise<string>``

    * ``group.getContract(address)``:
      Get a contract instance for the group at the specified address; returns ``Promise<GroupContract>``

    * ``group.getAccessorContract(address)``:
      Get a contract instance for the group accessor at the specified address; returns ``Promise<GroupAccessorContract>``

    * ``group.add(name, stakingFeeFraction, options, onConfirmation)``:
      Register a group with Rocket Pool with the specified name (string) and fraction of rewards to charge users (number); returns ``Promise<TransactionReceipt>``

    * ``group.createDefaultAccessor(groupId, options, onConfirmation)``:
      Create a default group accessor contract for the group with the specified ID (contract address); returns ``Promise<TransactionReceipt>``

**GroupContract**:

    * ``GroupContract.getDetails()``:
      Get the group's details; returns ``Promise<GroupDetails>``

    * ``GroupContract.getOwner()``:
      Get the group's owner address; returns ``Promise<string>``

    * ``GroupContract.getGroupFee()``:
      Get the fee charged to the group's users, as a fraction of their rewards; returns ``Promise<number>``

    * ``GroupContract.getRocketPoolFee()``:
      Get the fee charged to the group's users by Rocket Pool, as a fraction of their rewards; returns ``Promise<number>``

    * ``GroupContract.getGroupFeeAddress()``:
      Get the address which group fees are paid to; returns ``Promise<string>``

    * ``GroupContract.setGroupFee(feeFraction, options, onConfirmation)``:
      Set the fee charged to the group's users (number), as a fraction of their rewards; returns ``Promise<TransactionReceipt>``

    * ``GroupContract.setGroupFeeAddress(address, options, onConfirmation)``:
      Set the address which group fees are paid to; returns ``Promise<TransactionReceipt>``

    * ``GroupContract.addDepositor(address, options, onConfirmation)``:
      Register a depositor contract at the specified address with the group; returns ``Promise<TransactionReceipt>``

    * ``GroupContract.removeDepositor(address, options, onConfirmation)``:
      Remove the depositor contract at the specified address from the group; returns ``Promise<TransactionReceipt>``

    * ``GroupContract.addWithdrawer(address, options, onConfirmation)``:
      Register a withdrawer contract at the specified address with the group; returns ``Promise<TransactionReceipt>``

    * ``GroupContract.removeWithdrawer(address, options, onConfirmation)``:
      Remove the withdrawer contract at the specified address from the group; returns ``Promise<TransactionReceipt>``

**GroupAccessorContract**:

    * ``GroupAccessorContract.deposit(durationId, options, onConfirmation)``:
      Deposit an amount of ether into Rocket Pool for the specified staking duration (string); returns ``Promise<TransactionReceipt>``

    * ``GroupAccessorContract.refundQueuedDeposit(durationId, depositId, options, onConfirmation)``:
      Refund the portion of a deposit by ID (string) staking for the specified staking duration (string) which is still in the deposit queue; returns ``Promise<TransactionReceipt>``

    * ``GroupAccessorContract.refundStalledMinipoolDeposit``
      ``(depositId, minipoolAddress, options, onConfirmation)``:
      Refund the portion of a deposit by ID (string) assigned to the stalled minipool at minipoolAddress (string); returns ``Promise<TransactionReceipt>``

    * ``GroupAccessorContract.withdrawStakingMinipoolDeposit``
      ``(depositId, minipoolAddress, weiAmount, options, onConfirmation)``:
      Withdraw weiAmount (string) wei of a deposit by ID (string) from the staking minipool at minipoolAddress (string); returns ``Promise<TransactionReceipt>``

    * ``GroupAccessorContract.withdrawMinipoolDeposit``
      ``(depositId, minipoolAddress, options, onConfirmation)``:
      Withdraw the portion of a deposit by ID (string) assigned to the minipool at minipoolAddress (string) which has finished staking; returns ``Promise<TransactionReceipt>``

    * ``GroupAccessorContract.setDepositBackupAddress``
      ``(depositId, backupAddress, options, onConfirmation)``:
      Set a backup withdrawal address for a deposit by ID (string); returns ``Promise<TransactionReceipt>``
