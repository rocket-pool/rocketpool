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
        fee                     // The node commission rate as a fraction of 1 ether
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

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

    * ``minipool.``:
      ; returns ``Promise<>``

**MinipoolContract**:

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``

    * ``MinipoolContract.``:
      ; returns ``Promise<>``
