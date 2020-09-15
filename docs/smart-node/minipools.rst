.. _smart-node-minipools:

##################
Managing Minipools
##################


.. _smart-node-minipools-status:

************************
Checking Minipool Status
************************

Once you have made one or more deposits from your node, you can view the status of your created minipools with::

    rocketpool minipool status

This will list various properties of each minipool created by your node, including:

* Its address
* Its current status, and the time & block number it was last updated at
* The node commission rate on rewards earned by it
* The amount of ETH deposited by the node operator
* The amount of user-deposited ETH assigned, and the time it was assigned at
* The associated validator's public key

You will also be notified if any of your minipools have ETH available for refund or withdrawal.


.. _smart-node-minipools-refund:

************************
Refunding From Minipools
************************

If you have made any deposits of 32 ETH, the created minipools will have 16 ETH available for refund once user-deposited ETH is assigned to them.
You can refund this ETH to your node account with::

    rocketpool minipool refund

This will display a list of all eligible minipools, and prompt you to select one or all of them to refund your ETH from.
Once refunded, you should see their balances reflected in your node account.


.. _smart-node-minipools-withdraw:

**************************
Withdrawing From Minipools
**************************

If any of your minipools have exited and been marked as withdrawable by the Rocket Pool network, you can withdraw your deposit & rewards from them with::

    rocketpool minipool withdraw

This will display a list of all eligible minipools, and prompt you to select one or all of them to withdraw from.
Once refunded, the minipool/s will be destroyed, and you should see their balances reflected in your node account.

Note that before phase 2 of the Eth 2.0 rollout, rewards can only be withdrawn from exited minipools after a significant delay.


.. _smart-node-minipools-dissolve:

********************
Dissolving Minipools
********************

If you create a minipool and decide you want to back out before it begins staking, you can do so with::

    rocketpool minipool dissolve

This will display a list of all minipools which do not yet have user-deposited ETH assigned to them.
You will be prompted to select one or all of them to dissolve, returning your ETH deposit to your node account.
Once dissolved, the minipool/s will be destroyed, and you should see their balances reflected in your node account.

If you create a minipool and it fails to stake within a set time period after user-deposited ETH is assigned to it, it may be dissolved by another party.
This returns the user-deposited ETH to the deposit pool to be reassigned.
If this occurs, you can close the dissolved minipools with::

    rocketpool minipool close

This will display a list of all eligible minipools, and prompt you to select one or all of them to close.
Once closed, the minipool/s will be destroyed, and you should see their balances reflected in your node account.
