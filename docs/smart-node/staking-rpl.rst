.. _staking-rpl:

###########
Staking RPL
###########


.. _staking-rpl-swapping:

****************************
Swapping old RPL for new RPL
****************************

The balances displayed when you view your node's status include any amounts of "old RPL" under the node account.
This old RPL can be swapped for the new RPL token, which can be staked with Rocket Pool, allowing you to create minipools::

    rocketpool node swap-rpl

You can either swap your entire old RPL balance, or a portion of it if you prefer.
Note that you can also skip this step, and will be prompted to swap any old RPL when you try to stake it.


.. _staking-rpl-price:

**********************
Checking the RPL Price
**********************

Before staking RPL with Rocket Pool, you may wish to view the current RPL price recorded by the Rocket Pool network contracts.
The RPL price is reported by oracle nodes at set intervals, using data aggregated from a number of decentralized exchanges.
Check the current RPL price with::

    rocketpool network rpl-price

This will display the current recorded RPL price, along with the block it was last updated at.
The price will affect the minimum RPL stake, and maximum "effective stake", per minipool.


.. _staking-rpl-staking:

****************************
Staking RPL with Rocket Pool
****************************

Staking RPL with Rocket Pool allows you to create minipools and earn both eth2 & RP staking rewards.
Nodes must stake a minimum amount of RPL for each minipool they wish to run.
You can stake as much RPL as you like, but your "effective stake" will be limited based on the number of minipools you are running.
In both cases, the amounts vary depending on the current price of the RPL token recorded by the Rocket Pool network contracts.

Stake RPL with::

    rocketpool node stake-rpl

You will be prompted to select one of the following options:

    * Stake the minimum amount of RPL required to run one minipool
    * Stake the maximum amount of RPL that will count towards your "effective stake" for one minipool
    * Stake your entire RPL balance
    * Stake a custom amount of RPL


.. _staking-rpl-withdrawing:

**********************
Withdrawing Staked RPL
**********************

You can withdraw your staked RPL after a cooldown period has passed (since you last staked any amount)::

    rocketpool node withdraw-rpl

You will be prompted to select one of the following options:

    * Withdraw the maximum amount of RPL possible
    * Withdraw a custom amount of RPL

Note that you must leave a minimum amount of RPL staked to cover any running minipools you have.
As such, you won't be able to withdraw your entire RPL balance unless you have no minipools left.
