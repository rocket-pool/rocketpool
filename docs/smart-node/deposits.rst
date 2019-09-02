##########################
Making & Managing Deposits
##########################


*****************************
Checking Deposit Requirements
*****************************

Before making a deposit, you'll need to load your node account up with the required ETH and RPL.
Deposits always require 16 ETH, but the amount of RPL varies depending on current Rocket Pool network utilisation.
To check on the current RPL requirement, run:

    rocketpool deposit required [duration]

where ``[duration]`` is the time period you want to stake for (e.g. "3m", "6m" or "12m").
This will display a message like ``32.00 RPL required to cover a deposit amount of 16.00 ETH for 3m @ 2.00 RPL / ETH``.


*******************
Reserving a Deposit
*******************

Because of the dynamic nature of the RPL requirement, deposits are performed in two steps.
First of all, they are "reserved", which locks in the RPL requirement for the deposit for 24 hours.
This gives you time to acquire the necessary ETH and RPL without having to worry about fluctuating prices.
Reserve a deposit with:

    rocketpool deposit reserve [duration]

where ``[duration]`` is the time period you want to stake for.
After successfully reserving a deposit, its ETH & RPL requirements, staking duration and expiry time will be displayed.

You can check this information again later with:

    rocketpool deposit status


*******************
Canceling a Deposit
*******************

You may cancel your deposit reservation for any reason with:

    rocketpool deposit cancel

This may be useful if, for example, the RPL requirement has dropped since you made your reservation and you want to deposit at a lower RPL cost.


********************
Completing a Deposit
********************

You can complete the deposit process to create a minipool ready to accept user deposits with:

    rocketpool deposit complete

Completing the deposit requires the necessary ETH and RPL to be sent to the node contract.
If the node contract's balances are insufficient, you will be prompted to send ETH and/or RPL to it from your node account.
After successfully completing the deposit, your new minipool's address will be displayed.
