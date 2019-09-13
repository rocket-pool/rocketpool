.. _contracts-groups:

##################
Groups & Accessors
##################


********
Overview
********

All user deposits into the Rocket Pool network are made through a Group.
An organisation can register as a Group with Rocket Pool, allowing them to move funds into the network for staking.
This effectively allows them to use Rocket Pool as staking infrastructure, using their own deposit processes and application front-ends.
Rocket Pool uses an `"eat your own dog food" <https://en.wikipedia.org/wiki/Eating_your_own_dog_food>`_ approach, with its own registered Group for processing user interactions.

After registering with Rocket Pool, a Group must create and deploy one or more Depositor and Withdrawer contracts to handle user deposits and withdrawals.
These contracts must be registered with the Group, and then user deposits and withdrawals for the Group can be made via them.
If no custom deposit or withdrawal logic is required, Rocket Pool provides a "default" Group Accessor contract factory, which provides simple functionality for both.
This contract simply acts as a proxy, forwarding user deposits into the network, and refunds and withdrawals back into user accounts.


************
Registration
************

Registering a Group is performed via the ``RocketGroupAPI.add`` method, accepting the following parameters:

    * ``name`` (*string*): A unique name for the Group (must not already be in use)
    * ``stakingFee`` (*uint256*): A percentage of rewards to charge the Group's users, given as a fraction of 1 ether, in wei (e.g. 50000000000000000 = 5%)

This method also requires a transaction value of 0.05 ETH; this amount is charged to discourage excessive Group registrations.
Registering a Group creates a new ``RocketGroupContract`` instance, registers it with the network, and emits a ``GroupAdd`` event with an ``ID`` property corresponding to its address.
The *owner* of the Group is considered to be the address which registered it.


*****************
Accessor Creation
*****************

A "default" Group Accessor contract can be created via the ``RocketGroupAPI.createDefaultAccessor`` method, accepting a single parameter:

    * ``ID`` (*address*): The ID of the Group (its ``RocketGroupContract`` instance address)

This emits a ``GroupCreateDefaultAccessor`` event with an ``accessorAddress`` property corresponding to the created contract's address.

Alternatively, custom Depositor and Withdrawer contracts may be created and deployed to the network.

All custom Depositor contracts *must* implement the `RocketGroupAccessorContractInterface <https://github.com/rocket-pool/rocketpool/blob/master/contracts/interface/group/RocketGroupAccessorContractInterface.sol>`_.
Specifically, they must have an external, payable ``rocketpoolEtherDeposit`` method which returns ``true`` to indicate success.
This allows them to receive ether being sent back from refunded deposits.

There are no other strict requirements for Depositor and Withdrawer contracts, but they should provide the following functionality:

**Depositor:**

    * A payable "deposit" method to accept payments and transfer them to Rocket Pool
    * A "refund queued deposit" method to handle refunds of deposits which are still queued
    * A "refund stalled deposit" method to handle refunds of deposits assigned to stalled minipools

**Withdrawer:**

    * A "withdraw" method to handle withdrawals of funds from minipools which have completed staking
    * A "withdraw during staking" method to handle (penalised) withdrawals of funds from staking minipools
    * A "set backup withdrawal address" method to set a backup withdrawal address for a deposit

These methods should all interact with the ``RocketDepositAPI`` contract; refer to :ref:`its documentation <contracts-deposits>` or to the `"default" Group Accessor contract <https://github.com/rocket-pool/rocketpool/blob/master/contracts/contract/group/RocketGroupAccessorContract.sol>`_ for implementation examples.

**Note:** the ``RocketDepositAPI`` contract address should *not* be hard-coded in custom Group Accessor contracts, but retrieved from ``RocketStorage`` dynamically.


*********************
Accessor Registration
*********************

Once Group Accessor contracts have been created, they can be registered with the Group via the ``RocketGroupContract.addDepositor`` and ``RocketGroupContract.addWithdrawer`` methods.
These methods are both restricted to the owner of the Group contract, and accept a single parameter:

    * ``address`` (*address*): The address of the Accessor contract to register with the Group
