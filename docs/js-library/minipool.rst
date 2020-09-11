.. _js-library-minipool:

########
Minipool
########


********
Overview
********

The ``minipool`` module loads general minipool data from the chain.
It also provides minipool contract functionality (which manages individual minipools and loads their data).


.. _js-library-minipool-types:

**********
Data Types
**********

``MinipoolDetails`` objects contain various globally registered details of a minipool::

    MinipoolDetails {
        address                 // The registered address of the minipool
        exists                  // Whether the minipool exists
        pubkey                  // The minipool's associated validator pubkey
        withdrawalTotalBalance  // The minipool's total validator balance at withdrawal
        withdrawalNodeBalance   // The node's share of the validator balance at withdrawal
        withdrawable            // Whether the minipool has become withdrawable yet
        withdrawalProcessed     // Whether the minipool's withdrawal has been processed yet
    }

``StatusDetails`` objects define the current status of a minipool::

    StatusDetails {
        status                  // The minipool's current status code
        block                   // The block at which the status was last changed
        time                    // The timestamp at which the status was last changed
    }

``NodeDetails`` objects contain details about the node owning a minipool::

    NodeDetails {
        address                 // The address of the node owning the minipool
        fee                     // The node commission rate as a fraction of 1
        depositBalance          // The balance of ETH deposited by the node
        refundBalance           // The balance of ETH available for refund to the node
        depositAssigned         // Whether the node's ETH deposit has been assigned
    }

``UserDetails`` objects contain details about user ETH assigned to a minipool::

    UserDetails {
        depositBalance          // The balance of ETH from Rocket Pool user deposits
        depositAssigned         // Whether user-deposited ETH has been assigned
        depositAssignedTime     // The timestamp at which user-deposited ETH was assigned
    }

``StakingDetails`` objects contain details about a minipool's balance during staking::

    StakingDetails {
        startBalance            // The minipool's balance when shared staking began
        endBalance              // The minipool's balance when shared staking finished
    }

``MinipoolContract`` objects wrap a web3 contract instance and provide methods for managing a minipool and retrieving its information.


.. _js-library-minipool-methods:

*******
Methods
*******

**Minipool Module**:

    * ``minipool.getMinipools()``:
      Get the details of all minipools in the network; returns ``Promise<MinipoolDetails[]>``

    * ``minipool.getMinipoolAddresses()``:
      Get the addresses of all minipools in the network; returns ``Promise<string[]>``

    * ``minipool.getNodeMinipools(nodeAddress)``:
      Get the details of all minipools owned by a node; returns ``Promise<MinipoolDetails[]>``

    * ``minipool.getNodeMinipoolAddresses(nodeAddress)``:
      Get the addresses of all minipools owned by a node; returns ``Promise<string[]>``

    * ``minipool.getMinipoolDetails(address)``:
      Get the details of the specified minipool; returns ``Promise<MinipoolDetails>``

    * ``minipool.getMinipoolCount()``:
      Get the total number of minipools in the network; returns ``Promise<number>``

    * ``minipool.getMinipoolAt(index)``:
      Get the address of a minipool in the network by index; returns ``Promise<string>``

    * ``minipool.getNodeMinipoolCount(nodeAddress)``:
      Get the total number of minipools owned by a node; returns ``Promise<number>``

    * ``minipool.getNodeMinipoolAt(nodeAddress, index)``:
      Get the address of a minipool owned by a node by index; returns ``Promise<string>``

    * ``minipool.getMinipoolByPubkey(validatorPubkey)``:
      Get the address of a minipool by its validator pubkey; returns ``Promise<string>``

    * ``minipool.getMinipoolExists(address)``:
      Check whether the specified minipool exists; returns ``Promise<boolean>``

    * ``minipool.getMinipoolPubkey(address)``:
      Get the specified minipool's validator pubkey; returns ``Promise<string>``

    * ``minipool.getMinipoolWithdrawalTotalBalance(address)``:
      Get the specified minipool's total validator balance at withdrawal in wei; returns ``Promise<string>``

    * ``minipool.getMinipoolWithdrawalNodeBalance(address)``:
      Get the node's share of the specified minipool's validator balance at withdrawal in wei; returns ``Promise<string>``

    * ``minipool.getMinipoolWithdrawable(address)``:
      Get whether the specified minipool has become withdrawable yet; returns ``Promise<boolean>``

    * ``minipool.getMinipoolWithdrawalProcessed(address)``:
      Get whether the specified minipool's withdrawal has been processed yet; returns ``Promise<boolean>``

    * ``minipool.getQueueTotalLength()``:
      Get the total length of the minipool queue; returns ``Promise<number>``

    * ``minipool.getQueueTotalCapacity()``:
      Get the total capacity of the minipool queue in wei; returns ``Promise<string>``

    * ``minipool.getQueueEffectiveCapacity()``:
      Get the capacity of the minipool queue, ignoring "empty" minipools, in wei; returns ``Promise<string>``

    * ``minipool.getQueueNextCapacity()``:
      Get the capacity of the next available minipool in the queue in wei; returns ``Promise<string>``

    * ``minipool.getMinipoolNodeRewardAmount(nodeFee, userDepositBalance, startBalance, endBalance)``:
      Get the node reward amount for a minipool by staking details in wei; returns ``Promise<string>``

    * ``minipool.getMinipoolContract(address)``:
      Get a MinipoolContract instance for the specified minipool; returns ``Promise<MinipoolContract>``

    * ``minipool.submitMinipoolWithdrawable(minipoolAddress, stakingStartBalance, stakingEndBalance, options, onConfirmation)``:
      Submit a minipool's withdrawable status (watchtower nodes only); returns ``Promise<TransactionReceipt>``

**MinipoolContract**:

    * ``MinipoolContract.getStatusDetails()``:
      Get the minipool's status details; returns ``Promise<StatusDetails>``

    * ``MinipoolContract.getStatus()``:
      Get the minipool's status code; returns ``Promise<number>``

    * ``MinipoolContract.getStatusBlock()``:
      Get the block at which the minipool's status was last changed; returns ``Promise<number>``

    * ``MinipoolContract.getStatusTime()``:
      Get the time at which the minipool's status was last changed; returns ``Promise<Date>``

    * ``MinipoolContract.getDepositType()``:
      Get the code for the type of node deposit assigned to the minipool; returns ``Promise<number>``

    * ``MinipoolContract.getNodeDetails()``:
      Get the minipool's node details; returns ``Promise<NodeDetails>``

    * ``MinipoolContract.getNodeAddress()``:
      Get the address of the node owning the minipool; returns ``Promise<string>``

    * ``MinipoolContract.getNodeFee()``:
      Get the node commission rate for the minipool as a fraction of 1; returns ``Promise<number>``

    * ``MinipoolContract.getNodeDepositBalance()``:
      Get the balance of ETH deposited to the minipool by the node in wei; returns ``Promise<string>``

    * ``MinipoolContract.getNodeRefundBalance()``:
      Get the balance of ETH available for refund to the node in wei; returns ``Promise<string>``

    * ``MinipoolContract.getNodeDepositAssigned()``:
      Get whether the node deposit has been assigned to the minipool; returns ``Promise<boolean>``

    * ``MinipoolContract.getUserDetails()``:
      Get the minipool's user deposit details; returns ``Promise<UserDetails>``

    * ``MinipoolContract.getUserDepositBalance()``:
      Get the balance of ETH deposited to the minipool by RP users in wei; returns ``Promise<string>``

    * ``MinipoolContract.getUserDepositAssigned()``:
      Get whether RP user ETH has been assigned to the minipool; returns ``Promise<boolean>``

    * ``MinipoolContract.getUserDepositAssignedTime()``:
      Get the time at which RP user ETH was assigned to the minipool; returns ``Promise<Date>``

    * ``MinipoolContract.getStakingDetails()``:
      Get the minipool's staking details; returns ``Promise<StakingDetails>``

    * ``MinipoolContract.getStakingStartBalance()``:
      Get the minipool's balance when staking begain in wei; returns ``Promise<string>``

    * ``MinipoolContract.getStakingEndBalance()``:
      Get the minipool's balance when staking finished in wei; returns ``Promise<string>``

    * ``MinipoolContract.dissolve(options, onConfirmation)``:
      Dissolve the prelaunch minipool and return its ETH to the node & deposit pool; returns ``Promise<TransactionReceipt>``

    * ``MinipoolContract.refund(options, onConfirmation)``:
      Refund ETH owned by the node to the node account; returns ``Promise<TransactionReceipt>``

    * ``MinipoolContract.stake(validatorPubkey, validatorSignature, depositDataRoot, options, onConfirmation)``:
      Stake the prelaunch minipool with the specified validator details; returns ``Promise<TransactionReceipt>``

    * ``MinipoolContract.withdraw(options, onConfirmation)``:
      Withdraw the final balance & rewards from the withdrawable minipool and close it; returns ``Promise<TransactionReceipt>``

    * ``MinipoolContract.close(options, onConfirmation)``:
      Close the dissolved minipool and refund its node ETH balance; returns ``Promise<TransactionReceipt>``
