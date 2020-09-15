.. _smart-node-depositing:

###############
Making Deposits
###############


.. _smart-node-depositing-commission:

*********************************
Checking the Node Commission Rate
*********************************

Before making a deposit, you may wish to view the current Rocket Pool network node commission rate.
The commission rate varies depending on network node supply & demand dynamics, and changes as user deposits are made and minipools are created.
Check the current node commission rate with::

    rocketpool network node-fee

This will display the current rate, along with the minimum and maximum rates possible.
If you're happy with the current rate, you can make a deposit to create a minipool and start validating.


.. _smart-node-depositing-deposit:

****************
Making a Deposit
****************

You can make a deposit with::

    rocketpool node deposit

You will then be prompted to select an amount of ETH to deposit.
16 ETH deposits create minipools which must wait for user-deposited ETH to be assigned to them before they begin staking.
32 ETH deposits create minipools which can begin staking immediately, and will have the excess 16 ETH refunded once they are assigned to.

Next, you will be shown the current network node commission rate and prompted to enter a minimum commission rate you will accept.
You may either use the suggested value based on the data provided, or enter a custom one.
If the network node commission rate drops below this threshold before your deposit transaction is mined, the deposit will be cancelled.

If the deposit is made successfully, the address of the newly created minipool will be displayed.
