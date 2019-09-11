##########################
Making & Managing Deposits
##########################


*****************************
Checking Deposit Requirements
*****************************

Before making a deposit, you'll need to load your node account up with the required ETH and RPL.
Deposits always require 16 ETH, but the amount of RPL varies depending on current Rocket Pool network utilisation.
To check on the current RPL requirement, run::

    rocketpool deposit required [duration]

where ``[duration]`` is the time period you want to stake for (e.g. "3m", "6m" or "12m").
This will display a message like ``32.00 RPL required to cover a deposit amount of 16.00 ETH for 3m @ 2.00 RPL / ETH``.


****************
Making a Deposit
****************

You can make a deposit with::

    rocketpool deposit make [duration]

where ``[duration]`` is the time period you want to stake for.

Because of the dynamic nature of the RPL requirement, deposits are performed in two steps.
First of all, they are "reserved", which locks in the RPL requirement for the deposit for 24 hours.
Then, they are completed with a second transaction.
This gives you time to acquire the necessary ETH and RPL without having to worry about fluctuating prices.

After your deposit is reserved, its ETH & RPL requirements, staking duration and expiry time will be displayed.
Then, you will be prompted to select one of the following options:

	#. Complete the deposit
	#. Cancel the deposit
	#. Finish later

Completing the deposit will immediately complete the process and deposit your ETH and RPL into Rocket Pool.
This requires the necessary ETH and RPL to be sent to the node contract.
If the node contract's balances are insufficient, you will be prompted to send ETH and/or RPL to it from your node account.
After successfully completing the deposit, your new minipool's address will be displayed.

Canceling the deposit will cancel the reservation so that you can create a new one later.
This may be useful if, for example, you want to wait for the RPL requirement to drop and deposit at a lower RPL cost.

Finishing later simply stops the deposit process until you run the command again at a later time.
When you do, it will pick up where you left off.
